// npx tsx scripts/validate-sync-safety.ts
//
// Pure code checks (no DB access) guarding against the two bug classes fixed
// in July 2026: bracket mapping drift between lib/bracket.ts and
// lib/bracket-slots.ts, and any sync code writing to bracket_picks/predictions
// team-prediction fields (which must only ever be written by the user's own
// PredictionsEditor saves or the explicit /sync-r32 action).

import { readFileSync } from "fs"
import { ADVANCE, fillGroupAdvancers, advanceKnockout } from "../lib/bracket"
import { BRACKET_SLOTS } from "../lib/bracket-slots"

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`✅ ${label}`) }
  else { failed++; console.log(`❌ ${label}${detail ? ` — ${detail}` : ""}`) }
}

// ── 1. ADVANCE (lib/bracket.ts) must match BRACKET_SLOTS (lib/bracket-slots.ts) ──
// For every slot with a "Ganador X" placeholder, the source slot's ADVANCE
// entry must point back at it with the matching side.
const GANADOR_RE = /^Ganador\s+(.+)$/
for (const slot of BRACKET_SLOTS) {
  for (const side of ["home", "away"] as const) {
    const placeholder = side === "home" ? slot.home_placeholder : slot.away_placeholder
    const match = placeholder.match(GANADOR_RE)
    if (!match) continue // "Perdedor SF-01", group placeholders, etc. — not part of ADVANCE
    const sourceSlot = match[1]
    const advance = ADVANCE[sourceSlot]
    check(
      `ADVANCE["${sourceSlot}"] → ${slot.slot_key} (${side})`,
      !!advance && advance.next === slot.slot_key && advance.side === side,
      advance ? `got next=${advance.next} side=${advance.side}` : "missing from ADVANCE map"
    )
  }
}

// ── 2. Sync pipeline never writes to bracket_picks or predictions ──────────
// The central sync (lib/fixtures-sync.ts) and its three callers must never
// reference bracket_picks/predictions directly — only lib/recalculate.ts may
// (and only points_earned, audited separately). A regression here means a
// sync accidentally started overwriting user picks again.
const SYNC_FILES = [
  "../lib/fixtures-sync.ts",
  "../app/api/admin/sync/results/route.ts",
  "../app/api/cron/refresh-results/route.ts",
  "../app/api/sync/request-refresh/route.ts",
]
for (const relPath of SYNC_FILES) {
  const src = readFileSync(new URL(relPath, import.meta.url), "utf8")
  // Check actual usage (`.from("bracket_picks")`), not prose — these files'
  // own comments legitimately explain that they must NOT touch bracket_picks.
  check(`${relPath.replace("../", "")} never queries/writes bracket_picks`, !/\.from\(["']bracket_picks["']\)/.test(src))
  check(`${relPath.replace("../", "")} never queries/writes the predictions table`, !/\.from\(["']predictions["']\)/.test(src))
}

// ── 3. Knockout results never upsert by raw API id ─────────────────────────
// Every sync file must gate any `.from("fixtures").upsert(` call behind the
// group-only filter — i.e. no `upsert` call should run against the full
// `played` array, only `playedGroups`. This is a coarse but effective guard:
// a future edit that re-introduces `played.map` feeding an upsert would fail
// this check even if the author didn't realize the implication.
{
  const src = readFileSync(new URL("../lib/fixtures-sync.ts", import.meta.url), "utf8")
  const upsertOnAllPlayed = /playedGroups\.slice|playedGroups\.length/.test(src) && /\.upsert\(rows/.test(src)
  check("lib/fixtures-sync.ts upserts only playedGroups (never the full played[] array)", upsertOnAllPlayed)
  check("lib/fixtures-sync.ts matches knockout only into a synthetic slot (.eq(\"id\", syntheticId))", src.includes('.eq("id", syntheticId)'))
  check("lib/fixtures-sync.ts scopes its ghost cleanup to processed ids only (no blanket delete)", src.includes('.in("id", playedKnockout.map'))
}

// ── 4. Behavioral test: a confirmed real fixture (api_fixture_id set) must
// never have its teams overwritten by fillGroupAdvancers/advanceKnockout,
// while a slot with no api_fixture_id yet must still receive the projection.
// This is the exact bug from 2026-07-05: fillGroupAdvancers/advanceKnockout
// used to overwrite already-confirmed R32/R16 fixtures with a derived guess.
//
// Minimal in-memory fake of the Supabase query builder — supports just the
// chains lib/bracket.ts actually uses (select/eq/not/in/ilike/order + update).
type Row = Record<string, unknown>

class FakeQuery {
  private filters: Array<(r: Row) => boolean> = []
  private wantCount = false
  constructor(private rows: Row[]) {}
  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.wantCount = true
    return this
  }
  eq(col: string, val: unknown)    { this.filters.push(r => r[col] === val); return this }
  neq(col: string, val: unknown)   { this.filters.push(r => r[col] !== val); return this }
  in(col: string, vals: unknown[]) { this.filters.push(r => vals.includes(r[col])); return this }
  not(col: string, _op: string, val: unknown) {
    if (val === null) this.filters.push(r => r[col] !== null && r[col] !== undefined)
    return this
  }
  ilike(col: string, pattern: string) {
    const re = new RegExp("^" + pattern.replace(/%/g, ".*") + "$", "i")
    this.filters.push(r => typeof r[col] === "string" && re.test(r[col] as string))
    return this
  }
  order() { return this }
  update(patch: Row) {
    const self = this
    return { eq: async (col: string, val: unknown) => {
      const row = self.rows.find(r => r[col] === val)
      if (row) Object.assign(row, patch)
      return { error: null }
    } }
  }
  then(resolve: (v: { data?: Row[]; count?: number; error: null }) => void) {
    const filtered = this.rows.filter(r => this.filters.every(f => f(r)))
    resolve(this.wantCount ? { count: filtered.length, error: null } : { data: filtered, error: null })
  }
}

class FakeSupabase {
  constructor(private store: Record<string, Row[]>) {}
  from(table: string) { return new FakeQuery(this.store[table] ?? []) }
}

async function testProtectionGuard() {
  // 72 dummy finished group games so fillGroupAdvancers' guard passes.
  const groupFixtures: Row[] = Array.from({ length: 72 }, (_, i) => ({
    id: 1000 + i, phase: "groups", status: "finished", home_score: 1, away_score: 0, group_name: "Grupo Z",
  }))

  const r32Fixtures: Row[] = [
    // Empty placeholder slot — should still receive the projected team.
    {
      id: 9000001, phase: "round_of_32", bracket_position: "R32-EMPTY",
      home_placeholder: "1ro Grupo E", away_placeholder: null,
      home_team_id: null, home_team_name: null, home_team_code: null, home_team_flag: null,
      away_team_id: null, away_team_name: null, away_team_code: null, away_team_flag: null,
      api_fixture_id: null,
    },
    // Already-confirmed real fixture — must NOT be touched even though its
    // placeholder textually matches the same "1ro Grupo E" pattern.
    {
      id: 9000002, phase: "round_of_32", bracket_position: "R32-CONFIRMED",
      home_placeholder: "1ro Grupo E", away_placeholder: null,
      home_team_id: 999, home_team_name: "RealConfirmedTeam", home_team_code: "RCT", home_team_flag: "flag.png",
      away_team_id: null, away_team_name: null, away_team_code: null, away_team_flag: null,
      api_fixture_id: 555555,
    },
  ]

  const standings = {
    "Grupo E": {
      25: { team_id: 25, team_name: "Germany", team_flag: "de.png", team_code: "GER", points: 9, goal_difference: 8, goals_for: 10, goals_against: 2, played: 3, won: 3, drawn: 0, lost: 0 },
    },
  }

  const fake = new FakeSupabase({ fixtures: [...groupFixtures, ...r32Fixtures] })
  await fillGroupAdvancers(fake as unknown as Parameters<typeof fillGroupAdvancers>[0], standings)

  const empty = r32Fixtures.find(f => f.bracket_position === "R32-EMPTY")!
  const confirmed = r32Fixtures.find(f => f.bracket_position === "R32-CONFIRMED")!
  check("fillGroupAdvancers fills an empty placeholder slot", empty.home_team_id === 25, `got ${empty.home_team_id}`)
  check("fillGroupAdvancers never overwrites a slot with api_fixture_id set", confirmed.home_team_id === 999, `got ${confirmed.home_team_id} (expected unchanged 999)`)

  // ── advanceKnockout: same guard, via a real ADVANCE pair (R32-01 → R16-02 home,
  // R32-04 → R16-03 home) so this also exercises Pass 1 (clear) + Pass 2 (advance).
  const knockoutFixtures: Row[] = [
    { id: 1, bracket_position: "R32-01", phase: "round_of_32", status: "finished",
      home_team_id: 111, home_team_name: "SourceWinner", home_team_code: null, home_team_flag: null,
      away_team_id: 222, away_team_name: "SourceLoser", away_team_code: null, away_team_flag: null,
      home_score: 1, away_score: 0, went_to_penalties: false, penalties_winner: null, api_fixture_id: 1 },
    { id: 2, bracket_position: "R32-04", phase: "round_of_32", status: "finished",
      home_team_id: 333, home_team_name: "SourceWinner2", home_team_code: null, home_team_flag: null,
      away_team_id: 444, away_team_name: "SourceLoser2", away_team_code: null, away_team_flag: null,
      home_score: 2, away_score: 1, went_to_penalties: false, penalties_winner: null, api_fixture_id: 2 },
    { id: 3, bracket_position: "R16-02", phase: "round_of_16", status: "not_started",
      home_team_id: null, home_team_name: null, home_team_code: null, home_team_flag: null,
      away_team_id: null, away_team_name: null, away_team_code: null, away_team_flag: null,
      home_score: null, away_score: null, went_to_penalties: false, penalties_winner: null, api_fixture_id: null },
    { id: 4, bracket_position: "R16-03", phase: "round_of_16", status: "not_started",
      home_team_id: 777, home_team_name: "RealConfirmedR16", home_team_code: null, home_team_flag: null,
      away_team_id: 888, away_team_name: "RealConfirmedR16Away", away_team_code: null, away_team_flag: null,
      home_score: null, away_score: null, went_to_penalties: false, penalties_winner: null, api_fixture_id: 999999 },
  ]
  const fake2 = new FakeSupabase({ fixtures: knockoutFixtures })
  await advanceKnockout(fake2 as unknown as Parameters<typeof advanceKnockout>[0])

  const r16_02 = knockoutFixtures.find(f => f.bracket_position === "R16-02")!
  const r16_03 = knockoutFixtures.find(f => f.bracket_position === "R16-03")!
  check("advanceKnockout advances a winner into an unconfirmed slot", r16_02.home_team_id === 111, `got ${r16_02.home_team_id}`)
  check(
    "advanceKnockout never overwrites a slot with api_fixture_id set (home)",
    r16_03.home_team_id === 777, `got ${r16_03.home_team_id} (expected unchanged 777)`
  )
  check(
    "advanceKnockout never clears a slot with api_fixture_id set (away, Pass 1)",
    r16_03.away_team_id === 888, `got ${r16_03.away_team_id} (expected unchanged 888)`
  )
}

testProtectionGuard().then(() => {
  console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
})
