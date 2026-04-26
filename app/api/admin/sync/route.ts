import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import { getPhaseFromRound } from "@/lib/scoring"
import { apiFetch, mapStatus, writeLog, LEAGUE_ID, SEASON, type FixtureAPIResponse } from "@/lib/api-football"

// ── Verificación de admin ─────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) return null
  return user
}

// ── GET: devuelve el historial de sincronizaciones ────────────────────────

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  try {
    const { data, error } = await admin
      .from("fixture_sync_log")
      .select("id, sync_type, status, message, rows_affected, ran_at")
      .order("ran_at", { ascending: false })
      .limit(10)

    // Si la tabla aún no existe, devolvemos vacío en vez de error 500
    if (error) return NextResponse.json({ logs: [] })
    return NextResponse.json({ logs: data ?? [] })
  } catch {
    return NextResponse.json({ logs: [] })
  }
}

// ── POST: importa TODOS los fixtures del Mundial 2026 ────────────────────
//
// Qué hace:
//   1. Llama a API-Football: GET /fixtures?league=1&season=2026
//   2. Mapea los datos al schema de Supabase
//   3. Hace upsert por lotes → seguro correr múltiples veces (idempotente)
//   4. Registra el resultado en fixture_sync_log
//
// Cuándo usar: al inicio del torneo o si cambia el calendario.
// Para actualizar solo scores durante el torneo → usar POST /api/admin/sync/results

export async function POST() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Validar que existe la API key antes de intentar la llamada
  const apiKey = process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta API_FOOTBALL_KEY en .env.local — agrega la variable y reinicia el servidor" },
      { status: 500 }
    )
  }

  // 1. Obtener fixtures desde API-Football (server-side — la key no llega al browser)
  let fixtures: FixtureAPIResponse[]
  try {
    const res = await apiFetch(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`)
    const data = await res.json()

    // La API devuelve errores en data.errors (no en el status HTTP)
    if (!res.ok || (data.errors && Object.keys(data.errors).length > 0)) {
      const errMsg = data.errors
        ? Object.values(data.errors).join(", ")
        : `HTTP ${res.status}`
      await writeLog("fixtures", "error", `API error: ${errMsg}`, 0)
      return NextResponse.json(
        { error: `Error de API-Football: ${errMsg}` },
        { status: 502 }
      )
    }

    fixtures = data.response ?? []
  } catch (err) {
    const msg = `Error de red al contactar API-Football: ${err instanceof Error ? err.message : String(err)}`
    await writeLog("fixtures", "error", msg, 0)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  if (!fixtures.length) {
    await writeLog("fixtures", "success", "API devolvió 0 partidos — ¿está configurado el torneo?", 0)
    return NextResponse.json({ message: "La API devolvió 0 partidos", count: 0 })
  }

  // 2. Upsert en Supabase por lotes de 50
  //    - El cliente admin bypasea RLS para poder escribir en fixtures
  //    - onConflict: "id" → si ya existe el fixture, actualiza; si no, inserta
  //    - Esto hace el import idempotente (seguro correr múltiples veces)
  const admin = createAdminClient()
  const BATCH = 50
  let upserted = 0

  try {
    for (let i = 0; i < fixtures.length; i += BATCH) {
      const batch = fixtures.slice(i, i + BATCH)
      const rows = batch.map((f) => {
        const round = f.league?.round ?? ""
        const phase = getPhaseFromRound(round)

        // Grupo real viene en f.league.group ("Group A", "Group B", etc.)
        // El campo round ("Group Stage - 1") indica jornada, no el grupo
        const rawGroup = f.league?.group ?? null
        const groupLetterMatch = rawGroup?.match(/([A-L])$/i)
        const groupName = groupLetterMatch ? `Grupo ${groupLetterMatch[1].toUpperCase()}` : null

        // Datos de penales (null si el partido no fue a penales)
        const penHome = f.score?.penalty?.home ?? null
        const penAway = f.score?.penalty?.away ?? null

        return {
          // ── Identidad ────────────────────────────────────────────────
          // Nota: usamos el fixture ID de la API directamente como PK.
          // Esto es equivalente a tener un campo "api_fixture_id" pero más simple.
          id:          f.fixture.id,
          league_id:   f.league.id,
          season:      f.league.season,

          // ── Programación ─────────────────────────────────────────────
          round,
          phase,
          group_name:  groupName,
          kickoff:     f.fixture.date,     // ISO 8601 en UTC (equiv. a "kickoff_at")

          // ── Estado del partido ────────────────────────────────────────
          status:       mapStatus(f.fixture.status.short),  // valor interno
          status_short: f.fixture.status.short,             // código crudo de API (ej. "FT")
          status_long:  f.fixture.status.long ?? null,      // texto legible (ej. "Full Time")
          elapsed:      f.fixture.status.elapsed ?? null,   // minutos jugados

          // ── Venue ────────────────────────────────────────────────────
          venue_name: f.venue?.name ?? null,
          venue_city: f.venue?.city ?? null,

          // ── Equipos (denormalizados para consultas rápidas) ───────────
          home_team_id:   f.teams.home.id,
          home_team_name: f.teams.home.name,
          home_team_code: f.teams.home.code ?? null,
          home_team_flag: f.teams.home.logo ?? null,
          away_team_id:   f.teams.away.id,
          away_team_name: f.teams.away.name,
          away_team_code: f.teams.away.code ?? null,
          away_team_flag: f.teams.away.logo ?? null,

          // ── Resultado ────────────────────────────────────────────────
          home_score:  f.goals?.home ?? null,   // equiv. a "home_goals"
          away_score:  f.goals?.away ?? null,   // equiv. a "away_goals"
          penalty_home: penHome,                // equiv. a "home_penalty_goals"
          penalty_away: penAway,                // equiv. a "away_penalty_goals"
          went_to_penalties: penHome !== null && penAway !== null,
          penalties_winner:
            penHome !== null && penAway !== null
              ? penHome > penAway ? "home" : "away"
              : null,

          // ── Metadatos ────────────────────────────────────────────────
          api_updated_at: f.fixture.timestamp
            ? new Date(f.fixture.timestamp * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        }
      })

      const { error } = await admin.from("fixtures").upsert(rows, { onConflict: "id" })
      if (error) throw new Error(`Error de Supabase al guardar fixtures: ${error.message}`)
      upserted += rows.length
    }

    // ── Post-process: derive group names via Union-Find when API omits them ──
    //
    // API-Football sometimes returns f.league.group = null even for group-stage
    // matches (common for future seasons). When that happens every fixture ends
    // up with group_name = null and the UI collapses all games into "Sin Grupo".
    //
    // Fix: cluster teams by which opponents they share (every team in a group
    // plays every other team exactly once) then assign Grupo A … Grupo L sorted
    // by each group's earliest kick-off time.

    const groupStageFixtures = fixtures.filter(f => {
      const phase = getPhaseFromRound(f.league?.round ?? "")
      return phase === "groups"
    })

    const apiProvidesGroups = groupStageFixtures.length > 0 &&
      groupStageFixtures.every(f => /([A-L])$/i.test(f.league?.group ?? ""))

    if (!apiProvidesGroups && groupStageFixtures.length > 0) {
      // Union-Find
      const parent = new Map<number, number>()
      const find = (x: number): number => {
        if (!parent.has(x)) parent.set(x, x)
        if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!))
        return parent.get(x)!
      }
      for (const f of groupStageFixtures) {
        const rh = find(f.teams.home.id), ra = find(f.teams.away.id)
        if (rh !== ra) parent.set(rh, ra)
      }

      // Cluster fixtures → Map<rootTeamId, fixtures[]>
      const clusterMap = new Map<number, FixtureAPIResponse[]>()
      for (const f of groupStageFixtures) {
        const root = find(f.teams.home.id)
        if (!clusterMap.has(root)) clusterMap.set(root, [])
        clusterMap.get(root)!.push(f)
      }

      // Sort clusters by earliest kickoff → assign Grupo A, B, …, L
      const sortedClusters = [...clusterMap.entries()].sort((a, b) => {
        const minA = Math.min(...a[1].map(f => f.fixture.timestamp))
        const minB = Math.min(...b[1].map(f => f.fixture.timestamp))
        return minA - minB
      })

      const LETTERS = "ABCDEFGHIJKL"
      const groupAssignments: Array<{ id: number; group_name: string }> = []
      sortedClusters.forEach(([, clusterFixtures], idx) => {
        const groupName = `Grupo ${LETTERS[idx] ?? idx + 1}`
        clusterFixtures.forEach(f => groupAssignments.push({ id: f.fixture.id, group_name: groupName }))
      })

      // Batch update (50 concurrent)
      for (let i = 0; i < groupAssignments.length; i += BATCH) {
        const batch = groupAssignments.slice(i, i + BATCH)
        await Promise.all(
          batch.map(({ id, group_name }) =>
            admin.from("fixtures").update({ group_name }).eq("id", id)
          )
        )
      }
    }

    // Desglose por fase para diagnóstico (visible en la UI y en Network tab)
    const breakdown: Record<string, number> = {}
    for (const f of fixtures) {
      const round = f.league?.round ?? "desconocido"
      breakdown[round] = (breakdown[round] ?? 0) + 1
    }
    const phases = Object.entries(breakdown)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([r, n]) => `${r}: ${n}`)

    const msg = `✅ ${upserted} partidos importados`
    await writeLog("fixtures", "success", msg, upserted)
    return NextResponse.json({
      message: msg,
      count: upserted,
      timestamp: new Date().toISOString(),
      // breakdown permite confirmar qué rounds devolvió la API
      breakdown: phases,
      groupsAssigned: !apiProvidesGroups && groupStageFixtures.length > 0
        ? `Grupos derivados por clustering (API no los envió)`
        : `Grupos tomados de la API`,
    })
  } catch (err) {
    const msg = String(err)
    await writeLog("fixtures", "error", msg, upserted)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
