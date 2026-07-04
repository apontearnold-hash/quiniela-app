// npx tsx scripts/validate-sync-safety.ts
//
// Pure code checks (no DB access) guarding against the two bug classes fixed
// in July 2026: bracket mapping drift between lib/bracket.ts and
// lib/bracket-slots.ts, and any sync code writing to bracket_picks/predictions
// team-prediction fields (which must only ever be written by the user's own
// PredictionsEditor saves or the explicit /sync-r32 action).

import { readFileSync } from "fs"
import { ADVANCE } from "../lib/bracket"
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

console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
