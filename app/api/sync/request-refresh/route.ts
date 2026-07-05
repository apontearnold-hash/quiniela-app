// User-facing sync endpoint — the "Actualizar resultados" button on the
// dashboard, callable by any logged-in user (10-minute cooldown for
// non-admins; admins bypass it). Calls the same central pipeline as the
// admin button and the cron job (lib/fixtures-sync.ts) — this route is only
// a thin layer for auth + cooldown + response shaping, no sync logic of
// its own.
//
// Safe: never exposes API keys, CRON_SECRET, or service role key in responses.
// Never deletes predictions or quinielas. Never touches bracket_picks or
// predictions team-prediction fields — those stay exactly as each user picked
// them, regardless of what the real fixture ends up being.

import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import { syncResultsFromApiFootball } from "@/lib/fixtures-sync"

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
          const nextAvailableAt = new Date(new Date(lastOk.ran_at).getTime() + USER_COOLDOWN_MS).toISOString()
          return NextResponse.json({
            ok:                false,
            cooldown:          true,
            minutes_ago:       minutesAgo,
            last_sync_at:      lastOk.ran_at,
            next_available_at: nextAvailableAt,
            timestamp,
          }, { status: 429 })
        }
      }
    } catch {
      // Guard DB failure → proceed with sync (fail open)
    }
  }

  // ── 4. Run the central sync pipeline ──────────────────────────────────────
  const r = await syncResultsFromApiFootball(admin, "[user-sync]")

  if (r.noMatchesYet) {
    return NextResponse.json({
      ok:                           true,
      message:                      "No matches started or finished yet",
      last_sync_at:                 timestamp,
      fixtures_checked:             r.fixturesChecked,
      fixtures_updated:             0,
      group_standings_recalculated: false,
      bracket_advanced:             0,
      ghost_rows_deleted:           0,
      predictions_processed:        0,
      quinielas_recalculated:       0,
      warnings:                     [],
      errors:                       [],
      timestamp,
    })
  }

  if (!r.ok && r.fixturesUpdated === 0 && r.groupsUpdated === 0 && r.knockoutUpdated === 0) {
    // Fatal failure before any write (API fetch error, upsert error, or maintenance mode)
    return NextResponse.json(
      { ok: false, error: "Could not fetch or apply results", maintenance: r.maintenanceMode, details: r.errors, timestamp },
      { status: r.maintenanceMode ? 503 : 502 }
    )
  }

  const nextAvailableAt = isAdmin ? null : new Date(now.getTime() + USER_COOLDOWN_MS).toISOString()

  return NextResponse.json({
    ok:                           r.errors.length === 0,
    last_sync_at:                 timestamp,
    next_available_at:            nextAvailableAt,
    fixtures_checked:             r.fixturesChecked,
    fixtures_updated:             r.fixturesUpdated,
    group_standings_recalculated: r.standingsRecalculated,
    bracket_advanced:             r.bracketAdvanced,
    ghost_rows_deleted:           r.ghostRowsDeleted,
    ghost_rows_remaining:         r.ghostRowsRemaining,
    orphan_knockout_rows:         r.orphanKnockoutRows,
    bracket_picks_untouched:      r.bracketPicksUntouched,
    predictions_processed:        r.predictionsProcessed,
    quinielas_recalculated:       r.quinielasRecalculated,
    warnings: r.warnings,
    errors:   r.errors,
    timestamp,
  })
}
