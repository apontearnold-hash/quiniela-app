// User-facing sync endpoint.
//
// Any logged-in user can request a results refresh. Regular users are subject
// to a 10-minute cooldown (based on the last SUCCESSFUL sync in fixture_sync_log).
// Admins bypass the cooldown and can trigger a sync at any time.
//
// Executes the same pipeline as the admin button and the cron job:
//   API-Football fetch → fixture upsert → synthetic slot propagation
//   → recalculateGroupStandings → recalculateAllPoints (paginated)
//
// Safe: never exposes API keys, CRON_SECRET, or service role key in responses.
// Never deletes fixtures, predictions, or quinielas.

import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import {
  apiFetch, mapStatus, writeLog,
  LEAGUE_ID, SEASON,
  type FixtureAPIResponse,
} from "@/lib/api-football"
import { recalculateAllPoints } from "@/lib/recalculate"
import { recalculateGroupStandings } from "@/lib/bracket"

const USER_COOLDOWN_MS = 10 * 60 * 1000   // 10 minutes for regular users

export async function POST() {
  // ── 1. Auth: require a logged-in Supabase user ────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const isAdmin  = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  const admin    = createAdminClient()
  const now      = new Date()
  const timestamp = now.toISOString()

  // ── 2. API key guard ──────────────────────────────────────────────────────
  const apiKey = process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Service temporarily unavailable" },
      { status: 503 }
    )
  }

  // ── 3. Cooldown: regular users only (admin always runs) ──────────────────
  // Only successful syncs count toward the cooldown; a failed sync does not
  // reset the clock, allowing quick retries after transient errors.
  if (!isAdmin) {
    try {
      const { data: lastOk } = await admin
        .from("fixture_sync_log")
        .select("ran_at")
        .eq("sync_type", "results")
        .eq("status", "success")
        .order("ran_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastOk?.ran_at) {
        const elapsedMs = now.getTime() - new Date(lastOk.ran_at).getTime()
        if (elapsedMs < USER_COOLDOWN_MS) {
          const minutesAgo = Math.max(1, Math.round(elapsedMs / 60_000))
          return NextResponse.json({
            ok:           false,
            cooldown:     true,
            minutes_ago:  minutesAgo,
            last_sync_at: lastOk.ran_at,
            timestamp,
          }, { status: 429 })
        }
      }
    } catch {
      // Guard DB failure → proceed with sync (fail open)
    }
  }

  // ── 4. Fetch fixtures from API-Football ───────────────────────────────────
  let apiFixtures: FixtureAPIResponse[]
  try {
    const res  = await apiFetch(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`)
    const data = await res.json()

    if (!res.ok || (data.errors && Object.keys(data.errors).length > 0)) {
      const errMsg = data.errors
        ? (Object.values(data.errors) as string[]).join(", ")
        : `HTTP ${res.status}`
      await writeLog("results", "error", `[user-sync] API error: ${errMsg}`, 0)
      return NextResponse.json(
        { ok: false, error: "Could not fetch results from football API", timestamp },
        { status: 502 }
      )
    }
    apiFixtures = data.response ?? []
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await writeLog("results", "error", `[user-sync] Network error: ${msg}`, 0)
    return NextResponse.json(
      { ok: false, error: "Network error contacting football API", timestamp },
      { status: 502 }
    )
  }

  const fixturesChecked = apiFixtures.length
  const played = apiFixtures.filter(f => f.fixture.status.short !== "NS")

  if (played.length === 0) {
    await writeLog("results", "success", "[user-sync] No started matches yet", 0)
    return NextResponse.json({
      ok:                           true,
      message:                      "No matches started or finished yet",
      last_sync_at:                 timestamp,
      fixtures_checked:             fixturesChecked,
      fixtures_updated:             0,
      group_standings_recalculated: false,
      predictions_processed:        0,
      quinielas_recalculated:       0,
      warnings:                     [],
      errors:                       [],
      timestamp,
    })
  }

  // ── 5. Upsert result fields (idempotent) ──────────────────────────────────
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
      if (error) throw new Error(error.message)
      fixturesUpdated += rows.length
    }

    // ── 6. Propagate to synthetic knockout slots ───────────────────────────
    const playedIds = played.map(f => f.fixture.id)
    if (playedIds.length > 0) {
      const { data: synthetic } = await admin
        .from("fixtures")
        .select("id, api_fixture_id")
        .gte("id", 9000000)
        .not("api_fixture_id", "is", null)
        .in("api_fixture_id", playedIds)

      if (synthetic && synthetic.length > 0) {
        const apiMap = new Map<number, FixtureAPIResponse>()
        for (const f of played) apiMap.set(f.fixture.id, f)

        await Promise.all(synthetic.map(slot => {
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
        }))
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    errors.push("fixture_upsert")
    console.error("[user-sync] Fixture upsert failed:", msg)
    await writeLog("results", "error", `[user-sync] Upsert failed: ${msg}`, fixturesUpdated)
    return NextResponse.json(
      { ok: false, error: "Database error updating fixtures", timestamp },
      { status: 500 }
    )
  }

  // ── 7. Recalculate group standings ────────────────────────────────────────
  let standingsRecalculated = false
  try {
    await recalculateGroupStandings(admin)
    standingsRecalculated = true
  } catch (err) {
    errors.push("standings")
    console.error("[user-sync] Standings failed:", err instanceof Error ? err.message : String(err))
  }

  // ── 8. Recalculate all points (paginated via fetchAllRows) ────────────────
  let predictionsProcessed  = 0
  let quinielasRecalculated = 0
  const warnings: string[]  = []

  try {
    const result = await recalculateAllPoints(admin)
    predictionsProcessed  = result.predictions
    quinielasRecalculated = result.quinielas
    warnings.push(...result.warnings)
  } catch (err) {
    errors.push("recalculate")
    console.error("[user-sync] Recalculate failed:", err instanceof Error ? err.message : String(err))
  }

  // ── 9. Log ────────────────────────────────────────────────────────────────
  const logMsg = [
    `[user-sync] ${fixturesUpdated}/${fixturesChecked} updated`,
    standingsRecalculated ? "standings ✓" : "standings ✗",
    `${predictionsProcessed} preds · ${quinielasRecalculated} quinielas`,
    ...(errors.length ? [`errors: ${errors.join(", ")}`] : []),
  ].join(" · ")

  await writeLog(
    "results",
    errors.length > 0 ? "error" : "success",
    logMsg,
    fixturesUpdated
  )

  return NextResponse.json({
    ok:                           errors.length === 0,
    last_sync_at:                 timestamp,
    fixtures_checked:             fixturesChecked,
    fixtures_updated:             fixturesUpdated,
    group_standings_recalculated: standingsRecalculated,
    predictions_processed:        predictionsProcessed,
    quinielas_recalculated:       quinielasRecalculated,
    warnings,
    errors,
    timestamp,
  })
}
