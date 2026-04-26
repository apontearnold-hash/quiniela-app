import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import { apiFetch, mapStatus, writeLog, LEAGUE_ID, SEASON, type FixtureAPIResponse } from "@/lib/api-football"
import { recalculateAllPoints } from "@/lib/recalculate"

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

  // 3. Upsert solo los campos de resultado
  //    onConflict: "id" + solo los campos del objeto → solo esos campos se actualizan.
  //    Los campos omitidos (home_team_name, kickoff, venue_name, etc.) NO se tocan.
  const admin = createAdminClient()
  const BATCH = 50
  let updated = 0

  try {
    for (let i = 0; i < played.length; i += BATCH) {
      const batch = played.slice(i, i + BATCH)
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

    const baseMsg = `✅ ${updated} resultados actualizados`

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
      ? `${baseMsg} · ${scoreResult.predictions} predicciones y ${scoreResult.quinielas} quinielas recalculadas`
      : baseMsg

    await writeLog("results", "success", msg, updated)
    return NextResponse.json({
      message: msg,
      count: updated,
      ...(scoreResult && { scored: scoreResult }),
      ...(scoreError && { scoreError }),
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const msg = String(err)
    await writeLog("results", "error", msg, updated)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
