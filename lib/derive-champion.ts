/**
 * Server-safe helper: derives each quiniela's predicted World Cup champion
 * purely from their saved predictions + bracket_picks, with no real results.
 *
 * Used by:
 *  - dashboard/page.tsx  (on-the-fly fallback for quinielas missing champion_team_name)
 *  - api/admin/backfill-champions  (one-time bulk backfill)
 */

import { BRACKET_FIXTURES, BRACKET_SLOTS } from "./bracket-slots"
import {
  computeGroupStandings,
  computeBest3rd,
  resolveKnockoutBracket,
  determineKnockoutWinner,
} from "./bracket-projection"
import type { Fixture, Phase } from "./types"

export interface PredRow {
  quiniela_id: string
  fixture_id:  number
  home_score_pred:    number | null
  away_score_pred:    number | null
  predicts_penalties: boolean
  penalties_winner:   string | null
}

export interface BracketPickRow {
  quiniela_id: string
  slot_key:    string
  home_score_pred:    number | null
  away_score_pred:    number | null
  predicts_penalties: boolean
  penalties_winner:   string | null
}

export interface ChampionEntry {
  name: string
  flag: string | null
}

/**
 * Returns a Map<quinielaId, ChampionEntry> derived entirely from each quiniela's
 * own picks — no real results involved.
 *
 * Quinielas whose users haven't filled the final bracket pick will be absent
 * from the returned map.
 */
export function deriveChampions(
  quinielaIds:   string[],
  groupFixtures: Fixture[],
  predictions:   PredRow[],
  bracketPicks:  BracketPickRow[],
): Map<string, ChampionEntry> {
  const result = new Map<string, ChampionEntry>()
  if (quinielaIds.length === 0) return result

  const finSlot = BRACKET_SLOTS.find(s => s.slot_key === "FIN")
  if (!finSlot) return result

  // Build byPhase once (same fixture structure for every quiniela)
  const allFixtures: Fixture[] = [...groupFixtures, ...BRACKET_FIXTURES]
  const byPhase: Partial<Record<Phase, Fixture[]>> = {}
  for (const f of allFixtures) {
    if (!f.phase) continue
    if (!byPhase[f.phase]) byPhase[f.phase] = []
    byPhase[f.phase]!.push(f)
  }

  // Group fixtures by group_name for standings computation
  const groupsByName = new Map<string, Fixture[]>()
  for (const f of groupFixtures) {
    if (!f.group_name) continue
    if (!groupsByName.has(f.group_name)) groupsByName.set(f.group_name, [])
    groupsByName.get(f.group_name)!.push(f)
  }

  // slot_key → virtual slot id
  const slotKeyToId = new Map(BRACKET_SLOTS.map(s => [s.slot_key, s.id]))

  for (const quinielaId of quinielaIds) {
    // Combine group predictions + bracket picks into a single preds record keyed by id
    const preds: Record<number, { home: string; away: string; predicts_penalties?: boolean; penalties_winner?: string }> = {}

    for (const p of predictions) {
      if (p.quiniela_id !== quinielaId || p.home_score_pred == null || p.away_score_pred == null) continue
      preds[p.fixture_id] = {
        home: String(p.home_score_pred),
        away: String(p.away_score_pred),
        predicts_penalties: p.predicts_penalties,
        penalties_winner:   p.penalties_winner ?? undefined,
      }
    }

    for (const bp of bracketPicks) {
      if (bp.quiniela_id !== quinielaId || bp.home_score_pred == null || bp.away_score_pred == null) continue
      const slotId = slotKeyToId.get(bp.slot_key)
      if (!slotId) continue
      preds[slotId] = {
        home: String(bp.home_score_pred),
        away: String(bp.away_score_pred),
        predicts_penalties: bp.predicts_penalties,
        penalties_winner:   bp.penalties_winner ?? undefined,
      }
    }

    // Compute projected group standings, best 3rd, full bracket
    const groupProjections = new Map<string, ReturnType<typeof computeGroupStandings>>()
    groupsByName.forEach((fixtures, groupName) => {
      groupProjections.set(groupName, computeGroupStandings(fixtures, preds, groupName))
    })
    const best3rd          = computeBest3rd(groupProjections)
    const projectedBracket = resolveKnockoutBracket(byPhase, groupProjections, best3rd, preds)

    const finResolved = projectedBracket[finSlot.id]
    const finPred     = preds[finSlot.id]
    if (!finResolved || !finPred) continue

    const h = Number(finPred.home), a = Number(finPred.away)
    if (isNaN(h) || isNaN(a)) continue

    const winner = determineKnockoutWinner(h, a, finPred.predicts_penalties ?? false, finPred.penalties_winner ?? null)
    if (winner === "home") result.set(quinielaId, { name: finResolved.homeName, flag: finResolved.homeFlag })
    else if (winner === "away") result.set(quinielaId, { name: finResolved.awayName, flag: finResolved.awayFlag })
  }

  return result
}
