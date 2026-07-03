import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import { apiFetch, mapStatus, writeLog, LEAGUE_ID, SEASON, type FixtureAPIResponse } from "@/lib/api-football"
import { getPhaseFromRound } from "@/lib/scoring"
import { recalculateAllPoints } from "@/lib/recalculate"
import { recalculateGroupStandings, fillGroupAdvancers, assignBest3rd, advanceKnockout } from "@/lib/bracket"

// ── POST: actualiza scores y status de partidos ya importados ─────────────
//
// Qué hace:
//   1. Llama a API-Football: GET /fixtures?league=1&season=2026 (mismo endpoint)
//   2. Filtra solo los partidos que ya han comenzado (descarta NS = not_started)
//   3. Hace upsert de SOLO los campos de resultado — no toca nombre/logo/fecha
//   4. Registra el resultado en fixture_sync_log
//
// Por qué no reimportar todo:
//   - Es más rápido durante el torneo
//   - No sobreescribe datos de bracket/placeholder que ajustamos manualmente
//   - Deja intactos los campos que no cambian (equipos, venue, round, etc.)
//
// Cuándo usar: durante el torneo, para ver scores actualizados.

export async function POST() {
  // Verificar que es el admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Validar API key antes de intentar la llamada
  const apiKey = process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta API_FOOTBALL_KEY en .env.local — agrega la variable y reinicia el servidor" },
      { status: 500 }
    )
  }

  // 1. Obtener todos los fixtures desde API-Football
  let apiFixtures: FixtureAPIResponse[]
  try {
    const res = await apiFetch(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`)
    const data = await res.json()

    if (!res.ok || (data.errors && Object.keys(data.errors).length > 0)) {
      const errMsg = data.errors
        ? Object.values(data.errors).join(", ")
        : `HTTP ${res.status}`
      await writeLog("results", "error", `Error de API-Football: ${errMsg}`, 0)
      return NextResponse.json(
        { error: `Error de API-Football: ${errMsg}` },
        { status: 502 }
      )
    }

    apiFixtures = data.response ?? []
  } catch (err) {
    const msg = `Error de red al contactar API-Football: ${err instanceof Error ? err.message : String(err)}`
    await writeLog("results", "error", msg, 0)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  // 2. Filtrar solo los partidos que han comenzado o terminado
  //    NS = Not Started → los excluimos para no hacer updates innecesarios
  const played = apiFixtures.filter(f => f.fixture.status.short !== "NS")

  if (!played.length) {
    await writeLog("results", "success", "Sin partidos en curso o terminados aún", 0)
    return NextResponse.json({ message: "Sin partidos en curso o terminados aún", count: 0 })
  }

  // Group-stage fixtures use id === api_fixture_id → safe to upsert directly.
  // Knockout-stage fixtures live at a synthetic id (>= 9000000) — upserting
  // them by raw API id creates a duplicate "ghost" row (null team/kickoff/phase,
  // real score/status) that the dashboard ticker sorts ahead of real results
  // (NULL kickoff sorts first in `order by kickoff desc`). Never do that here;
  // knockout results are only ever written into the matching synthetic slot.
  const playedGroups   = played.filter(f => getPhaseFromRound(f.league?.round ?? "") === "groups")
  const playedKnockout = played.filter(f => getPhaseFromRound(f.league?.round ?? "") !== "groups")

  const admin = createAdminClient()
  const BATCH = 50
  let updated = 0

  try {
    // 3. Upsert solo los campos de resultado de partidos de GRUPOS
    //    onConflict: "id" + solo los campos del objeto → solo esos campos se actualizan.
    //    Los campos omitidos (home_team_name, kickoff, venue_name, etc.) NO se tocan.
    for (let i = 0; i < playedGroups.length; i += BATCH) {
      const batch = playedGroups.slice(i, i + BATCH)
      const rows = batch.map((f) => {
        const penHome = f.score?.penalty?.home ?? null
        const penAway = f.score?.penalty?.away ?? null

        return {
          id:     f.fixture.id,   // clave para el upsert (= api_fixture_id)

          // Estado
          status:       mapStatus(f.fixture.status.short),
          status_short: f.fixture.status.short,
          status_long:  f.fixture.status.long ?? null,
          elapsed:      f.fixture.status.elapsed ?? null,

          // Scores (equiv. a home_goals / away_goals)
          home_score: f.goals?.home ?? null,
          away_score: f.goals?.away ?? null,

          // Penales (equiv. a home_penalty_goals / away_penalty_goals)
          penalty_home: penHome,
          penalty_away: penAway,
          went_to_penalties: penHome !== null && penAway !== null,
          penalties_winner:
            penHome !== null && penAway !== null
              ? penHome > penAway ? "home" : "away"
              : null,

          // Source priority: API results are authoritative — tags this row so
          // manual/simulation writes are blocked from overwriting it.
          result_source: "api",

          // Metadatos de la actualización
          api_updated_at: f.fixture.timestamp
            ? new Date(f.fixture.timestamp * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        }
      })

      const { error } = await admin.from("fixtures").upsert(rows, { onConflict: "id" })
      if (error) throw new Error(`Error de Supabase al actualizar resultados: ${error.message}`)
      updated += rows.length
    }

    // ── Propagate scores to synthetic knockout slots ─────────────────────
    // Match by api_fixture_id when already linked (previous sync), otherwise by
    // confirmed home+away team ID pair (handles a knockout fixture appearing for
    // the first time, e.g. once advanceKnockout below has filled a R16 slot's
    // teams). Never insert by raw API id — see comment above.
    let knockoutUpdated = 0
    if (playedKnockout.length > 0) {
      const { data: syntheticSlots } = await admin
        .from("fixtures")
        .select("id, home_team_id, away_team_id, api_fixture_id")
        .gte("id", 9000000)
        .not("bracket_position", "is", null)

      const slotByApiId = new Map<number, number>()
      const slotByTeams  = new Map<string, number>()
      for (const s of syntheticSlots ?? []) {
        if (s.api_fixture_id) slotByApiId.set(s.api_fixture_id, s.id)
        if (s.home_team_id && s.away_team_id) slotByTeams.set(`${s.home_team_id}:${s.away_team_id}`, s.id)
      }

      for (const f of playedKnockout) {
        let syntheticId = slotByApiId.get(f.fixture.id)
        if (!syntheticId && f.teams.home.id > 0 && f.teams.away.id > 0) {
          syntheticId = slotByTeams.get(`${f.teams.home.id}:${f.teams.away.id}`)
        }
        if (!syntheticId) continue // no matching synthetic slot yet — nothing to write

        const penHome = f.score?.penalty?.home ?? null
        const penAway = f.score?.penalty?.away ?? null
        const { error } = await admin.from("fixtures").update({
          api_fixture_id: f.fixture.id,
          status:       mapStatus(f.fixture.status.short),
          status_short: f.fixture.status.short,
          status_long:  f.fixture.status.long ?? null,
          elapsed:      f.fixture.status.elapsed ?? null,
          home_score:   f.goals?.home ?? null,
          away_score:   f.goals?.away ?? null,
          penalty_home: penHome,
          penalty_away: penAway,
          went_to_penalties: penHome !== null && penAway !== null,
          penalties_winner:  penHome !== null && penAway !== null
            ? penHome > penAway ? "home" : "away"
            : null,
          result_source: "api",
          api_updated_at: f.fixture.timestamp
            ? new Date(f.fixture.timestamp * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        }).eq("id", syntheticId)
        if (error) throw new Error(`Error de Supabase al actualizar slot de eliminatoria: ${error.message}`)
        knockoutUpdated++
      }
    }
    updated += knockoutUpdated

    const baseMsg = `✅ ${updated} resultados actualizados`

    // ── Recalculate group standings + advance bracket ────────────────────
    // Must run before recalculateAllPoints so groups/fixtures are fresh.
    // advanceKnockout writes the real winner into the next round's synthetic
    // slot (R32 → R16 → QF → SF → FIN) — without this, finished knockout
    // fixtures never propagate and the next round stays on placeholders.
    let standingsError: string | null = null
    let bracketAdvanced = 0
    try {
      const standings = await recalculateGroupStandings(admin)
      const groupFilled   = await fillGroupAdvancers(admin, standings)
      const best3rdFilled = await assignBest3rd(admin, standings)
      const knockoutAdvanced = await advanceKnockout(admin)
      bracketAdvanced = groupFilled + best3rdFilled + knockoutAdvanced
    } catch (err) {
      standingsError = err instanceof Error ? err.message : String(err)
      console.error("[sync/results] Standings/bracket recalculation failed:", standingsError)
    }

    // ── Safety net: remove any stray real-ID knockout rows with null team
    // names among the fixtures we just processed (defense in depth — mirrors
    // the cleanup in app/api/admin/sync/route.ts). Scoped to only the ids we
    // touched this run, never a blanket delete.
    if (playedKnockout.length > 0) {
      await admin
        .from("fixtures")
        .delete()
        .in("id", playedKnockout.map(f => f.fixture.id))
        .is("home_team_name", null)
    }

    // ── Recalculate all prediction scores after updating fixtures ────────
    let scoreResult: { predictions: number; quinielas: number } | null = null
    let scoreError: string | null = null
    try {
      scoreResult = await recalculateAllPoints(admin)
    } catch (err) {
      scoreError = err instanceof Error ? err.message : String(err)
      console.error("[sync/results] Score recalculation failed:", scoreError)
    }

    const msg = scoreResult
      ? `${baseMsg} · standings actualizados · bracket: ${bracketAdvanced} avances · ${scoreResult.predictions} predicciones y ${scoreResult.quinielas} quinielas recalculadas`
      : standingsError
        ? `${baseMsg} · standings error: ${standingsError}`
        : baseMsg

    await writeLog("results", "success", msg, updated)
    return NextResponse.json({
      message: msg,
      count: updated,
      bracketAdvanced,
      ...(scoreResult && { scored: scoreResult }),
      ...(scoreError && { scoreError }),
      ...(standingsError && { standingsError }),
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const msg = String(err)
    await writeLog("results", "error", msg, updated)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
