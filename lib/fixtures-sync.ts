// Single source of truth for pulling results from API-Football and propagating
// them through the app: fixture results (incl. penalties), group standings,
// bracket advancement, and prediction scoring.
//
// Used by every caller that talks to API-Football for live results:
//   - app/api/admin/sync/results/route.ts   (admin "Refrescar Resultados" button)
//   - app/api/cron/refresh-results/route.ts (scheduled cron)
//   - app/api/sync/request-refresh/route.ts (user-facing "Actualizar resultados" button)
//
// Callers are only responsible for auth + cooldown + shaping their own response;
// this file owns the actual sync logic so all three paths can never drift again.
//
// Why knockout fixtures need special handling:
//   Group-stage fixtures use id === api_fixture_id, so upserting by the raw API id
//   is always safe. Knockout fixtures live at a synthetic id (>= 9_000_000,
//   assigned in lib/bracket-slots.ts) — upserting a knockout result by the raw API
//   id would insert a brand-new "ghost" row (real score/status, but null team/
//   kickoff/phase, since those columns aren't in a results-only payload). Because
//   `order by kickoff desc` sorts NULL first in Postgres, a handful of these ghosts
//   is enough to push every real result off the front of the "recent results"
//   dashboard query. Knockout results are therefore only ever written into the
//   matching synthetic slot — matched by api_fixture_id when already linked, or by
//   the confirmed home+away team ID pair otherwise (e.g. right after
//   advanceKnockout has just filled a slot's teams for the first time).

import type { SupabaseClient } from "@supabase/supabase-js"
import { apiFetch, mapStatus, writeLog, LEAGUE_ID, SEASON, type FixtureAPIResponse } from "./api-football"
import { getPhaseFromRound } from "./scoring"
import { recalculateGroupStandings, fillGroupAdvancers, assignBest3rd, advanceKnockout } from "./bracket"
import { recalculateAllPoints } from "./recalculate"

const BATCH = 50

export interface FixturesSyncResult {
  ok: boolean
  noMatchesYet: boolean
  maintenanceMode: boolean
  fixturesChecked: number
  fixturesUpdated: number
  groupsUpdated: number
  knockoutUpdated: number
  ghostRowsDeleted: number
  standingsRecalculated: boolean
  bracketAdvanced: number
  predictionsProcessed: number
  quinielasRecalculated: number
  // Post-sync integrity scan (read-only — detects, never auto-deletes).
  ghostRowsRemaining: number
  orphanKnockoutRows: number
  bracketPicksUntouched: boolean
  warnings: string[]
  errors: string[]
}

function emptyResult(overrides: Partial<FixturesSyncResult> = {}): FixturesSyncResult {
  return {
    ok: false,
    noMatchesYet: false,
    maintenanceMode: false,
    fixturesChecked: 0,
    fixturesUpdated: 0,
    groupsUpdated: 0,
    knockoutUpdated: 0,
    ghostRowsDeleted: 0,
    standingsRecalculated: false,
    bracketAdvanced: 0,
    predictionsProcessed: 0,
    quinielasRecalculated: 0,
    ghostRowsRemaining: 0,
    orphanKnockoutRows: 0,
    bracketPicksUntouched: true,
    warnings: [],
    errors: [],
    ...overrides,
  }
}

/**
 * Fetches current results from API-Football and applies them:
 *   1. Upsert group-stage results directly (id === api_fixture_id, safe).
 *   2. Match knockout results into their synthetic slot only — never by raw
 *      API id (see module comment above for why).
 *   3. Defensively delete any stray ghost row among the ids just processed.
 *   4. Recalculate group standings, fill R32 advancers, assign best-3rd,
 *      advance knockout winners into the next round's synthetic slot.
 *   5. Recalculate all prediction/bracket_picks points and quiniela totals.
 *
 * Never touches bracket_picks/predictions team-prediction fields — only
 * points_earned (via recalculateAllPoints) and the real `fixtures` table.
 *
 * @param logPrefix  Short tag prepended to fixture_sync_log messages, e.g.
 *                    "[cron]" or "[user-sync]". Pass "" for the admin path.
 */
// ── Kill switch ──────────────────────────────────────────────────────────
// Set DISABLE_FIXTURES_SYNC=true in the environment to freeze all three sync
// paths (admin button, cron, user button) without a code change/deploy —
// only an env var change + redeploy on Vercel. Defaults to enabled (sync
// runs normally) when the var is unset, so a missing/misconfigured env var
// never silently disables the app. This blocks WRITES only; read-only
// diagnostics (scripts/check-ghost-fixtures.mjs) are unaffected.
//
// Added 2026-07-05 during the fillGroupAdvancers/advanceKnockout data
// integrity incident (see lib/bracket.ts's api_fixture_id guard) — kept as
// permanent operational tooling, not a one-off hack to delete later.
function isSyncDisabled(): boolean {
  return process.env.DISABLE_FIXTURES_SYNC === "true"
}

export async function syncResultsFromApiFootball(
  admin: SupabaseClient,
  logPrefix: string,
): Promise<FixturesSyncResult> {
  const tag = logPrefix ? `${logPrefix} ` : ""

  if (isSyncDisabled()) {
    await writeLog("results", "error", `${tag}Sync temporarily disabled for maintenance.`, 0)
    return emptyResult({ maintenanceMode: true, errors: ["Sync temporarily disabled for maintenance."] })
  }

  // Snapshot the bracket_picks row count before touching anything, so the
  // post-sync check below can prove this run never inserted/deleted a pick —
  // this file never writes to bracket_picks, but this is a cheap, real
  // production-time assertion of that fact rather than just a code comment.
  const { count: bracketPicksCountBefore } = await admin
    .from("bracket_picks")
    .select("id", { count: "exact", head: true })

  // ── 1. Fetch fixtures from API-Football ──────────────────────────────────
  let apiFixtures: FixtureAPIResponse[]
  try {
    const res  = await apiFetch(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`)
    const data = await res.json()

    if (!res.ok || (data.errors && Object.keys(data.errors).length > 0)) {
      const errMsg = data.errors
        ? (Object.values(data.errors) as string[]).join(", ")
        : `HTTP ${res.status}`
      await writeLog("results", "error", `${tag}API-Football error: ${errMsg}`, 0)
      return emptyResult({ errors: [`api: ${errMsg}`] })
    }
    apiFixtures = data.response ?? []
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await writeLog("results", "error", `${tag}Network/config error contacting API-Football: ${msg}`, 0)
    return emptyResult({ errors: [`api: ${msg}`] })
  }

  const fixturesChecked = apiFixtures.length
  const played = apiFixtures.filter(f => f.fixture.status.short !== "NS")

  if (played.length === 0) {
    await writeLog("results", "success", `${tag}No matches started or finished yet`, 0)
    return emptyResult({ ok: true, noMatchesYet: true, fixturesChecked })
  }

  // Group-stage fixtures use id === api_fixture_id → safe to upsert directly.
  const playedGroups   = played.filter(f => getPhaseFromRound(f.league?.round ?? "") === "groups")
  const playedKnockout = played.filter(f => getPhaseFromRound(f.league?.round ?? "") !== "groups")

  const errors: string[] = []
  let groupsUpdated = 0
  let knockoutUpdated = 0
  let ghostRowsDeleted = 0

  try {
    // ── 2. Upsert GROUP results directly ───────────────────────────────────
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
          updated_at: new Date().toISOString(),
        }
      })
      const { error } = await admin.from("fixtures").upsert(rows, { onConflict: "id" })
      if (error) throw new Error(`group upsert: ${error.message}`)
      groupsUpdated += rows.length
    }

    // ── 3. Match KNOCKOUT results into their synthetic slot only ───────────
    // Match by api_fixture_id when already linked, otherwise by confirmed
    // home+away team ID pair (handles a knockout fixture appearing for the
    // first time once advanceKnockout has filled that slot's teams below).
    // Never insert a new row keyed by the raw API id.
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
          updated_at: new Date().toISOString(),
        }).eq("id", syntheticId)
        if (error) throw new Error(`knockout slot update: ${error.message}`)
        knockoutUpdated++
      }

      // ── Safety net: delete any stray real-ID knockout row with a null team
      // name among the ids we just processed (defense in depth — mirrors the
      // cleanup in app/api/admin/sync/route.ts). Scoped to only those ids,
      // never a blanket delete, and reports exactly what it removed.
      const { data: deleted } = await admin
        .from("fixtures")
        .delete()
        .in("id", playedKnockout.map(f => f.fixture.id))
        .is("home_team_name", null)
        .select("id")
      ghostRowsDeleted = deleted?.length ?? 0
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[fixtures-sync]${logPrefix ? " " + logPrefix : ""} Fixture upsert failed:`, msg)
    await writeLog("results", "error", `${tag}Upsert failed after ${groupsUpdated + knockoutUpdated} rows: ${msg}`, groupsUpdated + knockoutUpdated)
    return emptyResult({
      fixturesChecked,
      fixturesUpdated: groupsUpdated + knockoutUpdated,
      groupsUpdated,
      knockoutUpdated,
      errors: [`fixture_upsert: ${msg}`],
    })
  }

  // ── 4. Recalculate group standings + advance bracket ─────────────────────
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
    const msg = err instanceof Error ? err.message : String(err)
    errors.push(`standings: ${msg}`)
    console.error(`[fixtures-sync]${logPrefix ? " " + logPrefix : ""} Standings/bracket failed:`, msg)
  }

  // ── 5. Recalculate all prediction/bracket_picks points (paginated) ────────
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
    console.error(`[fixtures-sync]${logPrefix ? " " + logPrefix : ""} Points recalculation failed:`, msg)
  }

  const fixturesUpdated = groupsUpdated + knockoutUpdated

  // ── 6. Defensive post-sync integrity scan (read-only — detect, don't fix) ──
  // Never auto-deletes anything found here; a nonzero count is a signal to
  // investigate (same checks as scripts/check-ghost-fixtures.mjs, run live
  // in production after every sync instead of only on manual demand).
  let ghostRowsRemaining = 0
  let orphanKnockoutRows = 0
  let bracketPicksUntouched = true
  try {
    const { count: phaseNullCount } = await admin
      .from("fixtures").select("id", { count: "exact", head: true }).is("phase", null)
    ghostRowsRemaining = phaseNullCount ?? 0

    const { count: orphanCount } = await admin
      .from("fixtures").select("id", { count: "exact", head: true })
      .not("phase", "is", null).neq("phase", "groups").is("bracket_position", null)
    orphanKnockoutRows = orphanCount ?? 0

    const { count: bracketPicksCountAfter } = await admin
      .from("bracket_picks").select("id", { count: "exact", head: true })
    bracketPicksUntouched = bracketPicksCountAfter === bracketPicksCountBefore

    if (ghostRowsRemaining > 0 || orphanKnockoutRows > 0 || !bracketPicksUntouched) {
      warnings.push(
        `integrity scan: ghost_rows=${ghostRowsRemaining} orphan_knockout=${orphanKnockoutRows} bracket_picks_count_changed=${!bracketPicksUntouched}`
      )
    }
  } catch (err) {
    // Scan failure should never fail the whole sync — it's a diagnostic, not a write.
    console.error(`[fixtures-sync]${logPrefix ? " " + logPrefix : ""} Post-sync integrity scan failed:`, err)
  }

  const logParts = [
    `${tag}${fixturesUpdated}/${fixturesChecked} fixtures updated`,
    standingsRecalculated ? `bracket: ${bracketAdvanced} avances` : "bracket ✗",
    `${predictionsProcessed} preds · ${quinielasRecalculated} quinielas`,
    ...(ghostRowsDeleted > 0 ? [`ghosts cleaned: ${ghostRowsDeleted}`] : []),
    ...(ghostRowsRemaining > 0 ? [`⚠ ghosts remaining: ${ghostRowsRemaining}`] : []),
    ...(orphanKnockoutRows > 0 ? [`⚠ orphan knockout rows: ${orphanKnockoutRows}`] : []),
    ...(!bracketPicksUntouched ? ["⚠ bracket_picks row count changed"] : []),
    ...(warnings.length ? [`warnings: ${warnings.join("; ")}`] : []),
    ...(errors.length   ? [`errors: ${errors.join("; ")}`]     : []),
  ]
  await writeLog(
    "results",
    errors.length > 0 ? "error" : "success",
    logParts.join(" · "),
    fixturesUpdated
  )

  return {
    ok: errors.length === 0,
    noMatchesYet: false,
    maintenanceMode: false,
    fixturesChecked,
    fixturesUpdated,
    groupsUpdated,
    knockoutUpdated,
    ghostRowsDeleted,
    standingsRecalculated,
    bracketAdvanced,
    predictionsProcessed,
    quinielasRecalculated,
    ghostRowsRemaining,
    orphanKnockoutRows,
    bracketPicksUntouched,
    warnings,
    errors,
  }
}
