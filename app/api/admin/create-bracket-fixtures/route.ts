import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase-server"
import { BRACKET_SLOTS } from "@/lib/bracket-slots"

const PLACEHOLDER_ID_BASE = 8_000_000

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

// POST — create placeholder fixtures for any knockout slot not yet in the DB
export async function POST() {
  const admin = createAdminClient()

  // Fetch all existing bracket_positions so we can skip duplicates
  const { data: existing, error: fetchErr } = await admin
    .from("fixtures")
    .select("bracket_position")
    .not("bracket_position", "is", null)

  if (fetchErr) return err(500, fetchErr.message)

  const existingPositions = new Set((existing ?? []).map(r => r.bracket_position as string))

  const toInsert = BRACKET_SLOTS
    .filter(slot => !existingPositions.has(slot.slot_key))
    .map((slot, _) => {
      // Stable ID: PLACEHOLDER_ID_BASE + index within BRACKET_SLOTS
      const idx = BRACKET_SLOTS.findIndex(s => s.slot_key === slot.slot_key)
      return {
        id: PLACEHOLDER_ID_BASE + idx + 1,
        league_id: 1,
        season: 2026,
        round: slot.slot_key,
        phase: slot.phase,
        group_name: null,
        kickoff: slot.kickoff,
        status: "not_started",
        status_short: "NS",
        status_long: "Not Started",
        elapsed: null,
        venue_name: null,
        venue_city: null,
        home_team_id: null,
        home_team_name: null,
        home_team_code: null,
        home_team_flag: null,
        away_team_id: null,
        away_team_name: null,
        away_team_code: null,
        away_team_flag: null,
        home_score: null,
        away_score: null,
        penalty_home: null,
        penalty_away: null,
        went_to_penalties: false,
        penalties_winner: null,
        bracket_position: slot.slot_key,
        home_placeholder: slot.home_placeholder,
        away_placeholder: slot.away_placeholder,
        api_updated_at: null,
        result_source: null,
      }
    })

  const skipped = BRACKET_SLOTS.length - toInsert.length
  let created = 0

  if (toInsert.length > 0) {
    const { error: insertErr } = await admin
      .from("fixtures")
      .upsert(toInsert, { onConflict: "id" })

    if (insertErr) return err(500, insertErr.message)
    created = toInsert.length
  }

  return NextResponse.json({
    ok: true,
    created,
    skipped,
    message: created === 0
      ? `Todos los fixtures ya existen (${skipped} saltados)`
      : `${created} fixtures creados, ${skipped} ya existían`,
  })
}

// DELETE — remove placeholder fixtures in the 8M range that are no longer needed
export async function DELETE() {
  const admin = createAdminClient()

  // Fetch all 8M-range placeholders
  const { data: placeholders, error: fetchErr } = await admin
    .from("fixtures")
    .select("id, bracket_position, home_score, result_source")
    .gte("id", PLACEHOLDER_ID_BASE + 1)
    .lte("id", PLACEHOLDER_ID_BASE + 32)

  if (fetchErr) return err(500, fetchErr.message)
  if (!placeholders || placeholders.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, kept: 0, message: "No hay fixtures placeholder para limpiar" })
  }

  // Fetch API-sourced fixtures for the same bracket positions (1M range)
  const positions = placeholders.map(p => p.bracket_position).filter(Boolean)
  const { data: apiFixtures } = await admin
    .from("fixtures")
    .select("bracket_position, result_source")
    .in("bracket_position", positions)
    .eq("result_source", "api")

  const apiPositions = new Set((apiFixtures ?? []).map(f => f.bracket_position as string))

  const toDelete: number[] = []
  const toKeep: number[] = []

  for (const p of placeholders) {
    const hasManualResult = p.home_score !== null
    const apiTookOver = p.bracket_position ? apiPositions.has(p.bracket_position) : false

    if (!hasManualResult || apiTookOver) {
      toDelete.push(p.id)
    } else {
      toKeep.push(p.id)
    }
  }

  let deleted = 0
  if (toDelete.length > 0) {
    const { error: delErr } = await admin
      .from("fixtures")
      .delete()
      .in("id", toDelete)

    if (delErr) return err(500, delErr.message)
    deleted = toDelete.length
  }

  const kept = toKeep.length
  const parts: string[] = []
  if (deleted > 0) parts.push(`${deleted} eliminados`)
  if (kept > 0) parts.push(`${kept} conservados (tienen resultado manual)`)

  return NextResponse.json({
    ok: true,
    deleted,
    kept,
    message: parts.length > 0 ? parts.join(", ") : "Nada que limpiar",
  })
}
