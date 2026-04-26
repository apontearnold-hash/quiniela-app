/**
 * Static definition of all 32 knockout bracket slots for the 2026 World Cup.
 *
 * WHY this file exists:
 *   The bracket structure (who plays who in R32-01, R16-01, etc.) is fixed by FIFA
 *   before the tournament starts. It doesn't depend on which teams qualified, and
 *   it doesn't depend on the API publishing knockout fixtures (which only happens
 *   once teams qualify, weeks later).
 *
 *   This lets users fill their full quiniela bracket from day one — no FK to
 *   fixture rows required. Picks are stored in `bracket_picks` (slot_key based).
 */

import type { Fixture, Phase } from "./types"

const SLOT_ID_BASE = 9_000_000

interface RawSlot {
  slot_key: string
  phase: Phase
  home_placeholder: string
  away_placeholder: string
  kickoff: string
}

const RAW_SLOTS: RawSlot[] = [
  // ── Round of 32 (16 games, Jun 29 – Jul 6) ─────────────────────────────
  { slot_key: "R32-01", phase: "round_of_32", home_placeholder: "1ro Grupo A",   away_placeholder: "2do Grupo B",            kickoff: "2026-06-29T17:00:00Z" },
  { slot_key: "R32-02", phase: "round_of_32", home_placeholder: "1ro Grupo C",   away_placeholder: "2do Grupo F",            kickoff: "2026-06-29T20:00:00Z" },
  { slot_key: "R32-03", phase: "round_of_32", home_placeholder: "1ro Grupo E",   away_placeholder: "Mejor 3ro (A/B/C/D/F)", kickoff: "2026-06-30T17:00:00Z" },
  { slot_key: "R32-04", phase: "round_of_32", home_placeholder: "1ro Grupo F",   away_placeholder: "2do Grupo C",            kickoff: "2026-06-30T20:00:00Z" },
  { slot_key: "R32-05", phase: "round_of_32", home_placeholder: "2do Grupo E",   away_placeholder: "2do Grupo I",            kickoff: "2026-07-01T17:00:00Z" },
  { slot_key: "R32-06", phase: "round_of_32", home_placeholder: "1ro Grupo I",   away_placeholder: "Mejor 3ro (C/D/F/G/H)", kickoff: "2026-07-01T20:00:00Z" },
  { slot_key: "R32-07", phase: "round_of_32", home_placeholder: "2do Grupo A",   away_placeholder: "Mejor 3ro (C/E/F/H/I)", kickoff: "2026-07-02T17:00:00Z" },
  { slot_key: "R32-08", phase: "round_of_32", home_placeholder: "1ro Grupo L",   away_placeholder: "Mejor 3ro (E/H/I/J/K)", kickoff: "2026-07-02T20:00:00Z" },
  { slot_key: "R32-09", phase: "round_of_32", home_placeholder: "1ro Grupo G",   away_placeholder: "Mejor 3ro (A/E/H/I/J)", kickoff: "2026-07-03T17:00:00Z" },
  { slot_key: "R32-10", phase: "round_of_32", home_placeholder: "1ro Grupo D",   away_placeholder: "Mejor 3ro (B/E/F/I/J)", kickoff: "2026-07-03T20:00:00Z" },
  { slot_key: "R32-11", phase: "round_of_32", home_placeholder: "1ro Grupo H",   away_placeholder: "2do Grupo J",            kickoff: "2026-07-04T17:00:00Z" },
  { slot_key: "R32-12", phase: "round_of_32", home_placeholder: "2do Grupo K",   away_placeholder: "2do Grupo L",            kickoff: "2026-07-04T20:00:00Z" },
  { slot_key: "R32-13", phase: "round_of_32", home_placeholder: "1ro Grupo B",   away_placeholder: "Mejor 3ro (E/F/G/I/J)", kickoff: "2026-07-05T17:00:00Z" },
  { slot_key: "R32-14", phase: "round_of_32", home_placeholder: "2do Grupo D",   away_placeholder: "2do Grupo G",            kickoff: "2026-07-05T20:00:00Z" },
  { slot_key: "R32-15", phase: "round_of_32", home_placeholder: "1ro Grupo J",   away_placeholder: "2do Grupo H",            kickoff: "2026-07-06T17:00:00Z" },
  { slot_key: "R32-16", phase: "round_of_32", home_placeholder: "1ro Grupo K",   away_placeholder: "Mejor 3ro (D/E/I/J/L)", kickoff: "2026-07-06T20:00:00Z" },

  // ── Round of 16 (8 games, Jul 8–11) ────────────────────────────────────
  { slot_key: "R16-01", phase: "round_of_16", home_placeholder: "Ganador R32-01", away_placeholder: "Ganador R32-02", kickoff: "2026-07-08T17:00:00Z" },
  { slot_key: "R16-02", phase: "round_of_16", home_placeholder: "Ganador R32-03", away_placeholder: "Ganador R32-04", kickoff: "2026-07-08T20:00:00Z" },
  { slot_key: "R16-03", phase: "round_of_16", home_placeholder: "Ganador R32-05", away_placeholder: "Ganador R32-06", kickoff: "2026-07-09T17:00:00Z" },
  { slot_key: "R16-04", phase: "round_of_16", home_placeholder: "Ganador R32-07", away_placeholder: "Ganador R32-08", kickoff: "2026-07-09T20:00:00Z" },
  { slot_key: "R16-05", phase: "round_of_16", home_placeholder: "Ganador R32-09", away_placeholder: "Ganador R32-10", kickoff: "2026-07-10T17:00:00Z" },
  { slot_key: "R16-06", phase: "round_of_16", home_placeholder: "Ganador R32-11", away_placeholder: "Ganador R32-12", kickoff: "2026-07-10T20:00:00Z" },
  { slot_key: "R16-07", phase: "round_of_16", home_placeholder: "Ganador R32-13", away_placeholder: "Ganador R32-14", kickoff: "2026-07-11T17:00:00Z" },
  { slot_key: "R16-08", phase: "round_of_16", home_placeholder: "Ganador R32-15", away_placeholder: "Ganador R32-16", kickoff: "2026-07-11T20:00:00Z" },

  // ── Quarterfinals (4 games, Jul 14–15) ─────────────────────────────────
  { slot_key: "QF-01", phase: "quarterfinals", home_placeholder: "Ganador R16-01", away_placeholder: "Ganador R16-02", kickoff: "2026-07-14T17:00:00Z" },
  { slot_key: "QF-02", phase: "quarterfinals", home_placeholder: "Ganador R16-03", away_placeholder: "Ganador R16-04", kickoff: "2026-07-14T20:00:00Z" },
  { slot_key: "QF-03", phase: "quarterfinals", home_placeholder: "Ganador R16-05", away_placeholder: "Ganador R16-06", kickoff: "2026-07-15T17:00:00Z" },
  { slot_key: "QF-04", phase: "quarterfinals", home_placeholder: "Ganador R16-07", away_placeholder: "Ganador R16-08", kickoff: "2026-07-15T20:00:00Z" },

  // ── Semifinals (2 games, Jul 18–19) ────────────────────────────────────
  { slot_key: "SF-01", phase: "semifinals", home_placeholder: "Ganador QF-01", away_placeholder: "Ganador QF-02", kickoff: "2026-07-18T20:00:00Z" },
  { slot_key: "SF-02", phase: "semifinals", home_placeholder: "Ganador QF-03", away_placeholder: "Ganador QF-04", kickoff: "2026-07-19T20:00:00Z" },

  // ── Third place (Jul 21) ────────────────────────────────────────────────
  { slot_key: "3P",  phase: "semifinals", home_placeholder: "Perdedor SF-01", away_placeholder: "Perdedor SF-02", kickoff: "2026-07-21T17:00:00Z" },

  // ── Final (Jul 22) ─────────────────────────────────────────────────────
  { slot_key: "FIN", phase: "final",     home_placeholder: "Ganador SF-01",  away_placeholder: "Ganador SF-02",  kickoff: "2026-07-22T20:00:00Z" },
]

export const BRACKET_SLOTS = RAW_SLOTS.map((s, i) => ({
  ...s,
  id: SLOT_ID_BASE + i + 1,
}))

export const SLOT_ID_MIN = SLOT_ID_BASE + 1
export const SLOT_ID_MAX = SLOT_ID_BASE + RAW_SLOTS.length

export function isBracketSlotId(id: number): boolean {
  return id >= SLOT_ID_MIN && id <= SLOT_ID_MAX
}

export function slotKeyById(id: number): string | undefined {
  const slot = BRACKET_SLOTS.find(s => s.id === id)
  return slot?.slot_key
}

/** Convert a bracket slot to a Fixture-compatible object so bracket-projection.ts works unchanged. */
export function slotToFixture(s: typeof BRACKET_SLOTS[0]): Fixture {
  return {
    id: s.id,
    league_id: 1,
    season: 2026,
    round: s.slot_key,
    phase: s.phase,
    group_name: null,
    kickoff: s.kickoff,
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
    bracket_position: s.slot_key,
    home_placeholder: s.home_placeholder,
    away_placeholder: s.away_placeholder,
    api_updated_at: null,
  }
}

/** All 32 slots as Fixture objects — merge with real group fixtures in edit page. */
export const BRACKET_FIXTURES: Fixture[] = BRACKET_SLOTS.map(slotToFixture)
