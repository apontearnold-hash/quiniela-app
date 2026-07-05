// Cron endpoint: calls the same central sync pipeline as the admin button
// and the user-facing "Actualizar resultados" button (lib/fixtures-sync.ts).
//
// Auth: Authorization: Bearer <CRON_SECRET>  (no Supabase session required)
// Safe to call every 10-15 min from an external scheduler (cron-job.org, etc.).
//
// Guard: skips execution if a sync already ran in the last 3 minutes,
// preventing wasted work when the admin button and the cron overlap.

import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase-server"
import { syncResultsFromApiFootball } from "@/lib/fixtures-sync"

// Skip if the last recorded sync (admin or cron) was more recent than this.
const SKIP_WINDOW_MS = 3 * 60 * 1000   // 3 minutes

export async function POST(request: Request) {
  const now = new Date()
  const timestamp = now.toISOString()

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

  // ── 4. Run the central sync pipeline ──────────────────────────────────────
  const r = await syncResultsFromApiFootball(admin, "[cron]")

  if (r.noMatchesYet) {
    return NextResponse.json({
      ok: true,
      source: "cron",
      timestamp,
      fixtures_checked:             r.fixturesChecked,
      fixtures_updated:             0,
      group_standings_recalculated: false,
      predictions_processed:        0,
      quinielas_recalculated:       0,
      warnings: [],
      errors:   [],
      message:  "No matches started or finished yet",
    })
  }

  if (!r.ok && r.fixturesUpdated === 0 && r.groupsUpdated === 0 && r.knockoutUpdated === 0) {
    // Fatal failure before any write (API fetch error, upsert error, or maintenance mode)
    return NextResponse.json(
      { ok: false, source: "cron", timestamp, fixtures_updated: 0, maintenance: r.maintenanceMode, error: r.errors.join("; ") },
      { status: r.maintenanceMode ? 503 : 502 }
    )
  }

  return NextResponse.json({
    ok:                           r.errors.length === 0,
    source:                       "cron",
    timestamp,
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
  })
}
