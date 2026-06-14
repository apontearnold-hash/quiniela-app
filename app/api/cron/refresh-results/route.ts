// Cron endpoint: replicates the admin "Refrescar Resultados" flow.
//
// Auth: Authorization: Bearer <CRON_SECRET>  (no Supabase session required)
// Safe to call every 10-15 min from an external scheduler (cron-job.org, etc.).
//
// What it does (same pipeline as /api/admin/sync/results):
//   1. GET /fixtures from API-Football (1 API call)
//   2. Upsert result fields for started/finished fixtures (idempotent)
//   3. Propagate scores to synthetic knockout slots (id >= 9000000)
//   4. recalculateGroupStandings
//   5. recalculateAllPoints (paginated via fetchAllRows — handles >1000 rows)
//   6. Write to fixture_sync_log with [cron] prefix
//
// Guard: skips execution if a sync already ran in the last 3 minutes,
// preventing wasted work when the admin button and the cron overlap.

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase-server"
import {
  apiFetch, mapStatus, writeLog,
  LEAGUE_ID, SEASON,
  type FixtureAPIResponse,
} from "@/lib/api-football"
import { recalculateAllPoints } from "@/lib/recalculate"
import { recalculateGroupStandings } from "@/lib/bracket"

// Skip if the last recorded sync (admin or cron) was more recent than this.
const SKIP_WINDOW_MS = 3 * 60 * 1000   // 3 minutes

export async function POST(request: Request) {
  const now = new Date()

  // ── 1. Auth: CRON_SECRET ──────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    // Fail closed: if the env var is not configured, block all requests.
    console.error("[cron/refresh-results] CRON_SECRET is not set in environment variables")
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
  }

  const authHeader = request.headers.get("authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
  if (!token || token !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // ── 2. API key presence check ─────────────────────────────────────────────
  const apiKey = process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "API_FOOTBALL_KEY not configured", source: "cron" },
      { status: 500 }
    )
  }

  const admin = createAdminClient()
  const timestamp = now.toISOString()

  // ── 3. Guard: skip if a sync ran recently ────────────────────────────────
  // Reads fixture_sync_log — fails open so a missing/broken table never blocks sync.
  try {
    const { data: recentLog } = await admin
      .from("fixture_sync_log")
      .select("ran_at")
      .eq("sync_type", "results")
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recentLog?.ran_at) {
      const elapsedMs = now.getTime() - new Date(recentLog.ran_at).getTime()
      if (elapsedMs < SKIP_WINDOW_MS) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          source: "cron",
          message: `sync skipped: last sync was ${Math.round(elapsedMs / 1000)}s ago`,
          last_sync: recentLog.ran_at,
          timestamp,
        })
      }
    }
  } catch {
    // Guard failure → proceed with sync (fail open; log table may be missing)
  }

  // ── 4. Fetch all fixtures from API-Football ───────────────────────────────
  let apiFixtures: FixtureAPIResponse[]
  try {
    const res  = await apiFetch(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`)
    const data = await res.json()

    if (!res.ok || (data.errors && Object.keys(data.errors).length > 0)) {
      const errMsg = data.errors
        ? (Object.values(data.errors) as string[]).join(", ")
        : `HTTP ${res.status}`
      await writeLog("results", "error", `[cron] API-Football error: ${errMsg}`, 0)
      return NextResponse.json(
        { ok: false, source: "cron", timestamp, error: errMsg },
        { status: 502 }
      )
    }

    apiFixtures = data.response ?? []
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await writeLog("results", "error", `[cron] Network error contacting API-Football: ${msg}`, 0)
    return NextResponse.json(
      { ok: false, source: "cron", timestamp, error: msg },
      { status: 502 }
    )
  }

  const fixturesChecked = apiFixtures.length
  // Filter out "Not Started" — no result data yet, upsert would be a no-op
  const played = apiFixtures.filter(f => f.fixture.status.short !== "NS")

  if (played.length === 0) {
    await writeLog("results", "success", "[cron] No matches started or finished yet", 0)
    return NextResponse.json({
      ok: true,
      source: "cron",
      timestamp,
      fixtures_checked:             fixturesChecked,
      fixtures_updated:             0,
      group_standings_recalculated: false,
      predictions_processed:        0,
      quinielas_recalculated:       0,
      warnings: [],
      errors:   [],
      message:  "No matches started or finished yet",
    })
  }

  // ── 5. Upsert result fields (idempotent: onConflict "id") ─────────────────
  const BATCH = 50
  let fixturesUpdated = 0
  const errors: string[] = []

  try {
    for (let i = 0; i < played.length; i += BATCH) {
      const batch = played.slice(i, i + BATCH)
      const rows = batch.map(f => {
        const penHome = f.score?.penalty?.home ?? null
        const penAway = f.score?.penalty?.away ?? null
        return {
          id:                f.fixture.id,
          status:            mapStatus(f.fixture.status.short),
          status_short:      f.fixture.status.short,
          status_long:       f.fixture.status.long ?? null,
          elapsed:           f.fixture.status.elapsed ?? null,
          home_score:        f.goals?.home ?? null,
          away_score:        f.goals?.away ?? null,
          penalty_home:      penHome,
          penalty_away:      penAway,
          went_to_penalties: penHome !== null && penAway !== null,
          penalties_winner:  penHome !== null && penAway !== null
            ? (penHome > penAway ? "home" : "away")
            : null,
          result_source:  "api" as const,
          api_updated_at: f.fixture.timestamp
            ? new Date(f.fixture.timestamp * 1000).toISOString()
            : null,
          updated_at: timestamp,
        }
      })

      const { error } = await admin.from("fixtures").upsert(rows, { onConflict: "id" })
      if (error) throw new Error(`Supabase upsert error: ${error.message}`)
      fixturesUpdated += rows.length
    }

    // ── 6. Propagate scores to synthetic knockout slots ───────────────────
    // Synthetic slots (id >= 9000000) are linked to real API fixtures via
    // api_fixture_id. Keeping them in sync lets advance-bracket and
    // recalculateAllPoints see real scores on those slots.
    const playedIds = played.map(f => f.fixture.id)
    if (playedIds.length > 0) {
      const { data: syntheticSlots } = await admin
        .from("fixtures")
        .select("id, api_fixture_id")
        .gte("id", 9000000)
        .not("api_fixture_id", "is", null)
        .in("api_fixture_id", playedIds)

      if (syntheticSlots && syntheticSlots.length > 0) {
        const apiMap = new Map<number, FixtureAPIResponse>()
        for (const f of played) apiMap.set(f.fixture.id, f)

        await Promise.all(
          syntheticSlots.map(slot => {
            const apiF = apiMap.get(slot.api_fixture_id!)
            if (!apiF) return Promise.resolve()
            const penHome = apiF.score?.penalty?.home ?? null
            const penAway = apiF.score?.penalty?.away ?? null
            return admin.from("fixtures").update({
              status:            mapStatus(apiF.fixture.status.short),
              status_short:      apiF.fixture.status.short,
              status_long:       apiF.fixture.status.long ?? null,
              elapsed:           apiF.fixture.status.elapsed ?? null,
              home_score:        apiF.goals?.home ?? null,
              away_score:        apiF.goals?.away ?? null,
              penalty_home:      penHome,
              penalty_away:      penAway,
              went_to_penalties: penHome !== null && penAway !== null,
              penalties_winner:  penHome !== null && penAway !== null
                ? (penHome > penAway ? "home" : "away")
                : null,
              result_source:  "api" as const,
              api_updated_at: apiF.fixture.timestamp
                ? new Date(apiF.fixture.timestamp * 1000).toISOString()
                : null,
              updated_at: timestamp,
            }).eq("id", slot.id)
          })
        )
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(msg)
    console.error("[cron/refresh-results] Fixture upsert failed:", msg)
    await writeLog("results", "error", `[cron] Upsert failed after ${fixturesUpdated} rows: ${msg}`, fixturesUpdated)
    return NextResponse.json(
      { ok: false, source: "cron", timestamp, fixtures_updated: fixturesUpdated, error: msg },
      { status: 500 }
    )
  }

  // ── 7. Recalculate group standings ────────────────────────────────────────
  let standingsRecalculated = false
  try {
    await recalculateGroupStandings(admin)
    standingsRecalculated = true
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(`standings: ${msg}`)
    console.error("[cron/refresh-results] Group standings recalculation failed:", msg)
  }

  // ── 8. Recalculate all prediction points (paginated via fetchAllRows) ─────
  let predictionsProcessed  = 0
  let quinielasRecalculated = 0
  const warnings: string[]  = []

  try {
    const result = await recalculateAllPoints(admin)
    predictionsProcessed  = result.predictions
    quinielasRecalculated = result.quinielas
    warnings.push(...result.warnings)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(`recalculate: ${msg}`)
    console.error("[cron/refresh-results] Points recalculation failed:", msg)
  }

  // ── 9. Write log entry ────────────────────────────────────────────────────
  const logParts = [
    `[cron] ${fixturesUpdated}/${fixturesChecked} fixtures updated`,
    standingsRecalculated ? "standings ✓" : "standings ✗",
    `${predictionsProcessed} preds · ${quinielasRecalculated} quinielas`,
    ...(warnings.length ? [`warnings: ${warnings.join("; ")}`] : []),
    ...(errors.length   ? [`errors: ${errors.join("; ")}`]     : []),
  ]
  await writeLog(
    "results",
    errors.length > 0 ? "error" : "success",
    logParts.join(" · "),
    fixturesUpdated
  )

  return NextResponse.json({
    ok:                           errors.length === 0,
    source:                       "cron",
    timestamp,
    fixtures_checked:             fixturesChecked,
    fixtures_updated:             fixturesUpdated,
    group_standings_recalculated: standingsRecalculated,
    predictions_processed:        predictionsProcessed,
    quinielas_recalculated:       quinielasRecalculated,
    warnings,
    errors,
  })
}
