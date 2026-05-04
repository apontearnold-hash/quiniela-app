import type { Fixture, Prediction, Phase } from './types'
import { PHASE_MULTIPLIER } from './types'

export interface ScoreResult {
  points: number
  breakdown: {
    multiplier: number
    exact: boolean
    correctWinner: boolean
    penaltyBonus: number
  }
}

export function calculatePredictionScore(
  fixture: Fixture,
  prediction: Prediction
): ScoreResult {
  const phase = (fixture.phase ?? 'groups') as Phase
  const multiplier = PHASE_MULTIPLIER[phase] ?? 1

  const { home_score, away_score } = fixture
  const { home_score_pred, away_score_pred } = prediction

  // No result yet or incomplete prediction
  if (
    home_score === null || away_score === null ||
    home_score_pred === null || away_score_pred === null
  ) {
    return { points: 0, breakdown: { multiplier, exact: false, correctWinner: false, penaltyBonus: 0 } }
  }

  let base = 0
  let exact = false
  let correctWinner = false

  // Exact result
  if (home_score_pred === home_score && away_score_pred === away_score) {
    base = 5
    exact = true
  } else {
    // Check correct winner/draw
    const actualWinner = home_score > away_score ? 'home' : away_score > home_score ? 'away' : 'draw'
    const predWinner = home_score_pred > away_score_pred ? 'home' : away_score_pred > home_score_pred ? 'away' : 'draw'

    if (actualWinner === predWinner) {
      base = 3
      correctWinner = actualWinner !== 'draw'
    }
  }

  // Penalty bonus (only for knockout phases)
  let penaltyBonus = 0
  if (phase !== 'groups' && fixture.went_to_penalties) {
    if (prediction.predicts_penalties) {
      penaltyBonus += 3
      if (prediction.penalties_winner === fixture.penalties_winner) {
        penaltyBonus += 5
      }
    }
  }

  const totalPoints = base * multiplier + penaltyBonus

  return {
    points: totalPoints,
    breakdown: { multiplier, exact, correctWinner, penaltyBonus }
  }
}

export function getPhaseFromRound(round: string): Phase {
  const r = round.toLowerCase()
  if (r.includes('group') || r.includes('grupo')) return 'groups'
  if (r.includes('round of 32') || r.includes('ronda de 32') || r.startsWith('r32')) return 'round_of_32'
  if (r.includes('round of 16') || r.includes('octavo') || r.startsWith('r16')) return 'round_of_16'
  if (r.includes('quarter') || r.includes('cuarto') || r.startsWith('qf')) return 'quarterfinals'
  if (r.includes('semi') || r.includes('tercer') || r.startsWith('sf') || r === '3p') return 'semifinals'
  if (r.includes('final') || r === 'fin') return 'final'
  return 'groups'
}
