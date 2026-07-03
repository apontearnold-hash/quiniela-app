// npx tsx scripts/validate-scoring.ts
import { calculatePredictionScore } from '../lib/scoring'
import { scoreBracketPick } from '../lib/recalculate'
import type { Fixture, Prediction, BracketPick } from '../lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fixture(overrides: Partial<Fixture>): Fixture {
  return {
    id: 9000001, phase: 'round_of_32', status: 'finished',
    home_team_id: 1, away_team_id: 2,
    home_team_name: 'Argentina', away_team_name: 'France',
    home_score: null, away_score: null,
    went_to_penalties: false, penalties_winner: null,
    penalty_home: null, penalty_away: null,
    bracket_position: 'R32-01', kickoff: '2026-07-01T20:00:00Z',
    ...overrides,
  } as Fixture
}

function pred(overrides: Partial<Prediction>): Prediction {
  return {
    id: 'test', quiniela_id: 'q1', fixture_id: 9000001,
    home_score_pred: null, away_score_pred: null,
    predicts_penalties: false, penalties_winner: null,
    points_earned: 0, created_at: '', updated_at: '',
    ...overrides,
  } as Prediction
}

function pick(overrides: Partial<BracketPick>): BracketPick {
  return {
    id: 'test-pick', quiniela_id: 'q1', slot_key: 'R16-01',
    home_score_pred: null, away_score_pred: null,
    predicts_penalties: false, penalties_winner: null,
    points_earned: 0,
    home_team_id_pred: null, away_team_id_pred: null,
    home_team_name_pred: null, away_team_name_pred: null,
    home_team_flag_pred: null, away_team_flag_pred: null,
    created_at: '', updated_at: '',
    ...overrides,
  } as BracketPick
}

// Team IDs used across the eliminated-team (mismatch) cases below.
const GERMANY = 101, FRANCE = 102, PARAGUAY = 103, SWEDEN = 104

interface Case {
  label: string
  fixture: Fixture
  prediction: Prediction
  expectedPoints: number
  expectedExact: boolean
  expectedWinner: boolean
}

// ── Test cases ─────────────────────────────────────────────────────────────────

// Real: Argentina 1–1 France, Argentina wins on penalties
const penaltyFixture = fixture({
  home_score: 1, away_score: 1,
  went_to_penalties: true, penalties_winner: 'home',  // Argentina
})

const cases: Case[] = [
  // ── Cases A–D from spec (R32 × 2) ──────────────────────────────────────────
  {
    label: 'A · R32 · exact score + correct penalty winner → 5×2 = 10',
    fixture: penaltyFixture,
    prediction: pred({ home_score_pred: 1, away_score_pred: 1, predicts_penalties: true, penalties_winner: 'home' }),
    expectedPoints: 10, expectedExact: true, expectedWinner: true,
  },
  {
    label: 'B · R32 · wrong score + correct penalty winner → 3×2 = 6',
    fixture: penaltyFixture,
    prediction: pred({ home_score_pred: 2, away_score_pred: 2, predicts_penalties: true, penalties_winner: 'home' }),
    expectedPoints: 6, expectedExact: false, expectedWinner: true,
  },
  {
    label: 'C · R32 · exact score + WRONG penalty winner → 0',
    fixture: penaltyFixture,
    prediction: pred({ home_score_pred: 1, away_score_pred: 1, predicts_penalties: true, penalties_winner: 'away' }),
    expectedPoints: 0, expectedExact: false, expectedWinner: false,
  },
  {
    label: 'D · R32 · straight win (2–1) when actual was 1–1+penalties → 3×2 = 6',
    fixture: penaltyFixture,
    prediction: pred({ home_score_pred: 2, away_score_pred: 1, predicts_penalties: false, penalties_winner: null }),
    expectedPoints: 6, expectedExact: false, expectedWinner: true,
  },

  // ── Draw prediction but no penalty pick → 0 ────────────────────────────────
  {
    label: 'E · R32 · exact score (1–1) but no penalty pick at all → 0',
    fixture: penaltyFixture,
    prediction: pred({ home_score_pred: 1, away_score_pred: 1, predicts_penalties: false, penalties_winner: null }),
    expectedPoints: 0, expectedExact: false, expectedWinner: false,
  },

  // ── Predicted loser, exact score → 0 ──────────────────────────────────────
  {
    label: 'F · R32 · wrong team via straight win (1–2) → 0',
    fixture: penaltyFixture,
    prediction: pred({ home_score_pred: 1, away_score_pred: 2, predicts_penalties: false, penalties_winner: null }),
    expectedPoints: 0, expectedExact: false, expectedWinner: false,
  },

  // ── Non-penalty knockout match ──────────────────────────────────────────────
  {
    label: 'G · R32 · regular win 2–1 exact → 5×2 = 10',
    fixture: fixture({ home_score: 2, away_score: 1, went_to_penalties: false }),
    prediction: pred({ home_score_pred: 2, away_score_pred: 1 }),
    expectedPoints: 10, expectedExact: true, expectedWinner: true,
  },
  {
    label: 'H · R32 · regular win 2–1, pred 3–0 (correct winner, wrong score) → 3×2 = 6',
    fixture: fixture({ home_score: 2, away_score: 1, went_to_penalties: false }),
    prediction: pred({ home_score_pred: 3, away_score_pred: 0 }),
    expectedPoints: 6, expectedExact: false, expectedWinner: true,
  },
  {
    label: 'I · R32 · regular win 2–1, pred 1–2 (wrong winner) → 0',
    fixture: fixture({ home_score: 2, away_score: 1, went_to_penalties: false }),
    prediction: pred({ home_score_pred: 1, away_score_pred: 2 }),
    expectedPoints: 0, expectedExact: false, expectedWinner: false,
  },

  // ── Groups (multiplier = 1) ─────────────────────────────────────────────────
  {
    label: 'J · Groups · exact draw 1–1 → 5×1 = 5',
    fixture: fixture({ phase: 'groups', home_score: 1, away_score: 1, went_to_penalties: false, bracket_position: null }),
    prediction: pred({ home_score_pred: 1, away_score_pred: 1 }),
    expectedPoints: 5, expectedExact: true, expectedWinner: true,
  },
  {
    label: 'K · Groups · correct winner no exact → 3×1 = 3',
    fixture: fixture({ phase: 'groups', home_score: 2, away_score: 0, went_to_penalties: false, bracket_position: null }),
    prediction: pred({ home_score_pred: 1, away_score_pred: 0 }),
    expectedPoints: 3, expectedExact: false, expectedWinner: true,
  },
  {
    label: 'L · Groups · wrong winner → 0',
    fixture: fixture({ phase: 'groups', home_score: 2, away_score: 0, went_to_penalties: false, bracket_position: null }),
    prediction: pred({ home_score_pred: 0, away_score_pred: 1 }),
    expectedPoints: 0, expectedExact: false, expectedWinner: false,
  },

  // ── Phase multipliers ──────────────────────────────────────────────────────
  {
    label: 'M · R16 · exact 1–0 → 5×3 = 15',
    fixture: fixture({ phase: 'round_of_16', home_score: 1, away_score: 0, bracket_position: 'R16-01' }),
    prediction: pred({ home_score_pred: 1, away_score_pred: 0 }),
    expectedPoints: 15, expectedExact: true, expectedWinner: true,
  },
  {
    label: 'N · QF · correct winner → 3×4 = 12',
    fixture: fixture({ phase: 'quarterfinals', home_score: 2, away_score: 1, bracket_position: 'QF-01' }),
    prediction: pred({ home_score_pred: 1, away_score_pred: 0 }),
    expectedPoints: 12, expectedExact: false, expectedWinner: true,
  },
  {
    label: 'O · SF · exact with penalties Argentina → 5×5 = 25',
    fixture: fixture({ phase: 'semifinals', home_score: 0, away_score: 0, went_to_penalties: true, penalties_winner: 'home', bracket_position: 'SF-01' }),
    prediction: pred({ home_score_pred: 0, away_score_pred: 0, predicts_penalties: true, penalties_winner: 'home' }),
    expectedPoints: 25, expectedExact: true, expectedWinner: true,
  },
  {
    label: 'P · Final · exact 2–0 → 5×6 = 30',
    fixture: fixture({ phase: 'final', home_score: 2, away_score: 0, bracket_position: 'FIN' }),
    prediction: pred({ home_score_pred: 2, away_score_pred: 0 }),
    expectedPoints: 30, expectedExact: true, expectedWinner: true,
  },
]

interface PickCase {
  label: string
  fixture: Fixture
  pick: BracketPick
  expectedPoints: number
  expectedExact: boolean
  expectedWinner: boolean
}

// ── Eliminated-team (mismatch) cases A–E ────────────────────────────────────────
// A predicted team can be eliminated before its fixture, but the *other*
// predicted team can still score points if it plays the real match. A pick
// never transfers to whoever eliminated the predicted team (Germany's slot
// does NOT become Paraguay's slot just because Paraguay beat Germany).

const pickCases: PickCase[] = [
  {
    label: 'A · R16 · Germany 0–1 France pred, real Paraguay 0–1 France → exact 5×3 = 15',
    fixture: fixture({
      phase: 'round_of_16', bracket_position: 'R16-01',
      home_team_id: PARAGUAY, away_team_id: FRANCE,
      home_score: 0, away_score: 1,
    }),
    pick: pick({
      slot_key: 'R16-01',
      home_team_id_pred: GERMANY, away_team_id_pred: FRANCE,
      home_score_pred: 0, away_score_pred: 1,
    }),
    expectedPoints: 15, expectedExact: true, expectedWinner: true,
  },
  {
    label: 'B · R16 · Germany 1–2 France pred, real Paraguay 0–1 France → winner-only 3×3 = 9',
    fixture: fixture({
      phase: 'round_of_16', bracket_position: 'R16-01',
      home_team_id: PARAGUAY, away_team_id: FRANCE,
      home_score: 0, away_score: 1,
    }),
    pick: pick({
      slot_key: 'R16-01',
      home_team_id_pred: GERMANY, away_team_id_pred: FRANCE,
      home_score_pred: 1, away_score_pred: 2,
    }),
    expectedPoints: 9, expectedExact: false, expectedWinner: true,
  },
  {
    label: 'C · R16 · Germany 2–1 Sweden pred, real Paraguay 0–1 France → 0 (no transfer to Paraguay)',
    fixture: fixture({
      phase: 'round_of_16', bracket_position: 'R16-01',
      home_team_id: PARAGUAY, away_team_id: FRANCE,
      home_score: 0, away_score: 1,
    }),
    pick: pick({
      slot_key: 'R16-01',
      home_team_id_pred: GERMANY, away_team_id_pred: SWEDEN,
      home_score_pred: 2, away_score_pred: 1,
    }),
    expectedPoints: 0, expectedExact: false, expectedWinner: false,
  },
  {
    label: 'D · R16 · Germany 0–1 France pred, real France 1–0 Paraguay (side swap) → exact 5×3 = 15',
    fixture: fixture({
      phase: 'round_of_16', bracket_position: 'R16-01',
      home_team_id: FRANCE, away_team_id: PARAGUAY,
      home_score: 1, away_score: 0,
    }),
    pick: pick({
      slot_key: 'R16-01',
      home_team_id_pred: GERMANY, away_team_id_pred: FRANCE,
      home_score_pred: 0, away_score_pred: 1,
    }),
    expectedPoints: 15, expectedExact: true, expectedWinner: true,
  },
  {
    label: 'E · R16 · Germany 0–1 France pred, real France 2–0 Paraguay (side swap) → winner-only 3×3 = 9',
    fixture: fixture({
      phase: 'round_of_16', bracket_position: 'R16-01',
      home_team_id: FRANCE, away_team_id: PARAGUAY,
      home_score: 2, away_score: 0,
    }),
    pick: pick({
      slot_key: 'R16-01',
      home_team_id_pred: GERMANY, away_team_id_pred: FRANCE,
      home_score_pred: 0, away_score_pred: 1,
    }),
    expectedPoints: 9, expectedExact: false, expectedWinner: true,
  },
]

// ── Runner ─────────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

for (const c of cases) {
  const r = calculatePredictionScore(c.fixture, c.prediction)
  const ok =
    r.points === c.expectedPoints &&
    r.breakdown.exact === c.expectedExact &&
    r.breakdown.correctWinner === c.expectedWinner

  const status = ok ? '✅' : '❌'
  if (ok) {
    passed++
    console.log(`${status} ${c.label}`)
  } else {
    failed++
    console.log(`${status} ${c.label}`)
    console.log(`     Got: points=${r.points}, exact=${r.breakdown.exact}, winner=${r.breakdown.correctWinner}`)
    console.log(`  Expect: points=${c.expectedPoints}, exact=${c.expectedExact}, winner=${c.expectedWinner}`)
  }
}

for (const c of pickCases) {
  const r = scoreBracketPick(c.fixture, c.pick)
  const ok =
    r.points === c.expectedPoints &&
    r.exact === c.expectedExact &&
    r.correctWinner === c.expectedWinner

  const status = ok ? '✅' : '❌'
  if (ok) {
    passed++
    console.log(`${status} ${c.label}`)
  } else {
    failed++
    console.log(`${status} ${c.label}`)
    console.log(`     Got: points=${r.points}, exact=${r.exact}, winner=${r.correctWinner}`)
    console.log(`  Expect: points=${c.expectedPoints}, exact=${c.expectedExact}, winner=${c.expectedWinner}`)
  }
}

console.log(`\n${passed + failed} cases — ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
