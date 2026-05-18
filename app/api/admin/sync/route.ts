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

        // Datos de penales (null si el partido no fue a penales)
        const penHome = f.score?.penalty?.home ?? null
        const penAway = f.score?.penalty?.away ?? null

        return {
          // ── Identidad ────────────────────────────────────────────────
          id:          f.fixture.id,
          league_id:   f.league.id,
          season:      f.league.season,

          // ── Programación ─────────────────────────────────────────────
          round,
          phase,
          // group_name is intentionally excluded from the upsert.
          // It is managed in the separate group-update block below so that
          // re-syncing never overwrites manually-corrected group assignments.
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

    // ── Group name assignment: API-only, no auto-clustering ─────────────────
    //
    // group_name is written ONLY for fixtures where the API explicitly provides
    // f.league.group (e.g. "Group C"). If the API omits it, the existing DB value
    // is preserved — so manually-corrected groups survive re-syncs.
    //
    // REMOVED: the previous Union-Find clustering assigned Grupo A…L sorted by
    // earliest kickoff time. Chronological order ≠ FIFA draw order, which caused
    // groups to be labeled incorrectly (e.g. Grupo C↔D swapped). That algorithm
    // was replaced by this explicit API-only path to prevent silent data corruption.

    const groupUpdates: Array<{ id: number; group_name: string }> = []
    for (const f of fixtures) {
      const rawGroup = f.league?.group ?? null
      const match = rawGroup?.match(/([A-L])$/i)
      if (match) {
        groupUpdates.push({ id: f.fixture.id, group_name: `Grupo ${match[1].toUpperCase()}` })
      }
    }

    if (groupUpdates.length > 0) {
      for (let i = 0; i < groupUpdates.length; i += BATCH) {
        const batch = groupUpdates.slice(i, i + BATCH)
        await Promise.all(
          batch.map(({ id, group_name }) =>
            admin.from("fixtures").update({ group_name }).eq("id", id)
          )
        )
      }
    }

    // Diagnostic coverage
    const groupStageFixtures = fixtures.filter(f => {
      const phase = getPhaseFromRound(f.league?.round ?? "")
      return phase === "groups"
    })
    const groupStageIds = new Set(groupStageFixtures.map(f => f.fixture.id))
    const updatedGroupCount = groupUpdates.filter(u => groupStageIds.has(u.id)).length
    const missingGroupCount = groupStageFixtures.length - updatedGroupCount

    // ── Post-process: merge real API knockout fixtures into synthetic slots ──────
    //
    // Once API-Football publishes real R32+ fixtures (with real IDs and team data),
    // the main upsert above inserts them as NEW rows (different IDs from synthetic
    // slots 9000001+). This causes duplicate bracket_position rows and breaks score
    // propagation to advance-bracket.
    //
    // Fix: match real API knockout fixtures to synthetic slots by kickoff time,
    // update the synthetic slot with real team + score data (setting api_fixture_id),
    // then delete the duplicate real-ID row.
    const knockoutAPIFixtures = fixtures.filter(f => {
      const ph = getPhaseFromRound(f.league?.round ?? "")
      return ph !== null && ph !== "groups" && f.teams.home.id > 0 && f.teams.away.id > 0
    })

    let mergedKnockout = 0
    if (knockoutAPIFixtures.length > 0) {
      const { data: syntheticSlots } = await admin
        .from("fixtures")
        .select("id, kickoff")
        .gte("id", 9000000)
        .not("bracket_position", "is", null)

      const slotByKickoff = new Map<string, number>()
      for (const s of syntheticSlots ?? []) {
        if (s.kickoff) slotByKickoff.set(new Date(s.kickoff).toISOString(), s.id)
      }

      for (const f of knockoutAPIFixtures) {
        const apiKickoff = new Date(f.fixture.date).toISOString()
        const syntheticId = slotByKickoff.get(apiKickoff)
        if (!syntheticId) continue // no matching synthetic slot — not yet scheduled

        const penHome = f.score?.penalty?.home ?? null
        const penAway = f.score?.penalty?.away ?? null

        const { error: mergeErr } = await admin.from("fixtures").update({
          api_fixture_id:   f.fixture.id,
          home_team_id:     f.teams.home.id,
          home_team_name:   f.teams.home.name,
          home_team_code:   f.teams.home.code ?? null,
          home_team_flag:   f.teams.home.logo ?? null,
          away_team_id:     f.teams.away.id,
          away_team_name:   f.teams.away.name,
          away_team_code:   f.teams.away.code ?? null,
          away_team_flag:   f.teams.away.logo ?? null,
          home_score:       f.goals?.home ?? null,
          away_score:       f.goals?.away ?? null,
          penalty_home:     penHome,
          penalty_away:     penAway,
          went_to_penalties: penHome !== null && penAway !== null,
          penalties_winner:  penHome !== null && penAway !== null
            ? penHome > penAway ? "home" : "away"
            : null,
          status:       mapStatus(f.fixture.status.short),
          status_short: f.fixture.status.short,
          status_long:  f.fixture.status.long ?? null,
          result_source: f.goals?.home !== null ? "api" : null,
          updated_at:   new Date().toISOString(),
        }).eq("id", syntheticId)
        if (mergeErr) console.error(`[sync] merge knockout ${f.fixture.id} → ${syntheticId}:`, mergeErr.message)

        // Delete the duplicate real-ID row created by the main upsert
        await admin.from("fixtures").delete().eq("id", f.fixture.id)
        mergedKnockout++
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

    let groupsAssigned: string
    if (groupStageFixtures.length === 0) {
      groupsAssigned = "Sin partidos de grupos en la respuesta de la API"
    } else if (missingGroupCount === 0) {
      groupsAssigned = `Grupos desde API (${updatedGroupCount}/${groupStageFixtures.length} fixtures actualizados)`
    } else {
      const msg2 = `⚠️ API omitió grupo en ${missingGroupCount}/${groupStageFixtures.length} partidos de grupos — grupos existentes en DB preservados, corrección manual requerida`
      console.warn(`[sync] ${msg2}`)
      groupsAssigned = msg2
    }

    const msg = `✅ ${upserted} partidos importados${mergedKnockout > 0 ? ` · ${mergedKnockout} slots de eliminatoria actualizados desde API` : ""}`
    await writeLog("fixtures", "success", msg, upserted)
    return NextResponse.json({
      message: msg,
      count: upserted,
      mergedKnockout,
      timestamp: new Date().toISOString(),
      breakdown: phases,
      groupsAssigned,
    })
  } catch (err) {
    const msg = String(err)
    await writeLog("fixtures", "error", msg, upserted)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
