// User-facing sync endpoint.
//
// Any logged-in user can request a results refresh. Regular users are subject
// to a 10-minute cooldown (based on the last SUCCESSFUL sync in fixture_sync_log).
// Admins bypass the cooldown and can trigger a sync at any time.
//
// Executes the same pipeline as the admin button and the cron job:
//   API-Football fetch → fixture upsert (groups only, by real id) →
//   knockout results matched into their synthetic slot (never by raw API id) →
//   recalculateGroupStandings → fillGroupAdvancers → assignBest3rd →
//   advanceKnockout → recalculateAllPoints (paginated)
//
// Safe: never exposes API keys, CRON_SECRET, or service role key in responses.
// Never deletes fixtures, predictions, or quinielas. Never touches bracket_picks
// or predictions team fields — those stay exactly as each user picked them.

import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import {
  apiFetch, mapStatus, writeLog,
  LEAGUE_ID, SEASON,
  type FixtureAPIResponse,
} from "@/lib/api-football"
import { getPhaseFromRound } from "@/lib/scoring"
import { recalculateAllPoints } from "@/lib/recalculate"
import { recalculateGroupStandings, fillGroupAdvancers, assignBest3rd, advanceKnockout } from "@/lib/bracket"

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

  // Group-stage fixtures use id === api_fixture_id → safe to upsert directly.
  // Knockout-stage fixtures live at a synthetic id (>= 9000000) — upserting
  // them by raw API id creates a duplicate "ghost" row (null team/kickoff/phase,
  // real score/status) that the dashboard ticker sorts ahead of real results
  // (NULL kickoff sorts first in `order by kickoff desc`). Never do that here;
  // knockout results are only ever written into the matching synthetic slot.
  const playedGroups   = played.filter(f => getPhaseFromRound(f.league?.round ?? "") === "groups")
  const playedKnockout = played.filter(f => getPhaseFromRound(f.league?.round ?? "") !== "groups")

  // ── 5. Upsert result fields for GROUP fixtures (idempotent) ───────────────
  const BATCH = 50
  let fixturesUpdated = 0
  const errors: string[] = []

  try {
    for (let i = 0; i < playedGroups.length; i += BATCH) {
      const batch = playedGroups.slice(i, i + BATCH)
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

    // ── 6. Propagate scores to synthetic knockout slots ───────────────────
    // Match by api_fixture_id when already linked (previous sync), otherwise by
    // confirmed home+away team ID pair (handles a knockout fixture appearing for
    // the first time, e.g. once advanceKnockout below has filled a slot's teams).
    // Never insert by raw API id — see comment above.
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
          api_fixture_id:    f.fixture.id,
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
        }).eq("id", syntheticId)
        if (error) throw new Error(error.message)
        knockoutUpdated++
      }
    }
    fixturesUpdated += knockoutUpdated

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

  // ── 7. Recalculate group standings + advance bracket ──────────────────────
  // advanceKnockout writes the real winner into the next round's synthetic
  // slot (R32 → R16 → QF → SF → FIN) — without this, finished knockout
  // fixtures never propagate and the next round stays on placeholders.
  let standingsRecalculated = false
  let bracketAdvanced = 0
  try {
    const standings = await recalculateGroupStandings(admin)
    const groupFilled      = await fillGroupAdvancers(admin, standings)
    const best3rdFilled    = await assignBest3rd(admin, standings)
    const knockoutAdvanced = await advanceKnockout(admin)
    bracketAdvanced = groupFilled + best3rdFilled + knockoutAdvanced
    standingsRecalculated = true
  } catch (err) {
    errors.push("standings")
    console.error("[user-sync] Standings/bracket failed:", err instanceof Error ? err.message : String(err))
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
    standingsRecalculated ? `standings ✓ · bracket: ${bracketAdvanced} avances` : "standings ✗",
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
    bracket_advanced:             bracketAdvanced,
    predictions_processed:        predictionsProcessed,
    quinielas_recalculated:       quinielasRecalculated,
    warnings,
    errors,
    timestamp,
  })
}
