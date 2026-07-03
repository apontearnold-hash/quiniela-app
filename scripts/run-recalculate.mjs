// DEPRECATED — DO NOT USE.
//
// This script's scoring logic diverged from lib/scoring.ts / lib/recalculate.ts:
// it still used an old separate `penaltyBonus` (+3/+5) model instead of the
// current unified multiplier + winner/loser-goal-perspective exact logic.
// Running it against production overwrote points_earned for predictions and
// bracket_picks (and quinielas totals) with the wrong values — this already
// happened once and had to be corrected by re-running the real recalculation.
//
// The reliable recalculation path is:
//   - /api/admin/recalculate  (calls lib/recalculate.ts, used by the admin UI)
//   - scripts/admin-recalculate.mjs  (kept in sync with lib/scoring.ts / lib/recalculate.ts)
//
// This file is intentionally left as a hard stop instead of being resynced,
// to avoid re-introducing a scoring bug through a second, independently
// maintained copy of the same logic. Delete it once nobody references it,
// or resync it deliberately and re-verify against scripts/validate-scoring.ts
// before trusting it again.

console.error(
  "DEPRECATED: Do not use this script. Use /api/admin/recalculate or scripts/admin-recalculate.mjs instead."
)
process.exit(1)
