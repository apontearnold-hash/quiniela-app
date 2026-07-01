import type { Fixture, Prediction, Phase } from './types'
import { PHASE_MULTIPLIER } from './types'

export interface ScoreResult {
  points: number
  breakdown: {
    multiplier: number
    exact: boolean
    correctWinner: boolean
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

  if (
    home_score === null || away_score === null ||
    home_score_pred === null || away_score_pred === null
  ) {
    return { points: 0, breakdown: { multiplier, exact: false, correctWinner: false } }
  }

  // ── Actual winner: who advanced ─────────────────────────────────────
  // Draws in knockout phases are resolved by penalties_winner.
  // Draws in groups are a valid final result (no penalties).
  let actualWinner: 'home' | 'away' | 'draw'
  if (home_score > away_score) {
    actualWinner = 'home'
  } else if (away_score > home_score) {
    actualWinner = 'away'
  } else if (fixture.went_to_penalties && fixture.penalties_winner === 'home') {
    actualWinner = 'home'
  } else if (fixture.went_to_penalties && fixture.penalties_winner === 'away') {
    actualWinner = 'away'
  } else {
    actualWinner = 'draw'
  }

  // ── Predicted winner ─────────────────────────────────────────────────
  // For a draw-score prediction in a fixture that went to penalties:
  //   the penalty winner field determines who the user thinks advances.
  // For a draw-score prediction in a fixture without penalties (groups):
  //   the predicted result is a draw (penalties fields are irrelevant).
  let predWinner: 'home' | 'away' | 'draw'
  if (home_score_pred > away_score_pred) {
    predWinner = 'home'
  } else if (away_score_pred > home_score_pred) {
    predWinner = 'away'
  } else if (prediction.predicts_penalties && prediction.penalties_winner === 'home') {
    predWinner = 'home'
  } else if (prediction.predicts_penalties && prediction.penalties_winner === 'away') {
    predWinner = 'away'
  } else {
    predWinner = 'draw'
  }

  // ── Score ─────────────────────────────────────────────────────────────
  let base = 0
  let exact = false
  let correctWinner = false

  if (actualWinner === predWinner) {
    base = 3
    correctWinner = true

    if (home_score_pred === home_score && away_score_pred === away_score) {
      base = 5
      exact = true
    }
  }

  return {
    points: base * multiplier,
    breakdown: { multiplier, exact, correctWinner },
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
