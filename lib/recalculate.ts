import type { SupabaseClient } from "@supabase/supabase-js"
import { calculatePredictionScore } from "./scoring"
import type { Fixture, Prediction } from "./types"

export async function recalculateAllPoints(
  supabase: SupabaseClient
): Promise<{ predictions: number; quinielas: number }> {
  // ── 1. Load finished fixtures + all predictions + all bracket_picks ───
  const [
    { data: fixtures,    error: fErr },
    { data: preds,       error: pErr },
    { data: picks,       error: pickErr },
  ] = await Promise.all([
    supabase
      .from("fixtures")
      .select("*")
      .not("home_score", "is", null)
      .not("away_score", "is", null),
    supabase.from("predictions").select("*"),
    supabase.from("bracket_picks").select("*"),
  ])
  if (fErr)    throw fErr
  if (pErr)    throw pErr
  if (pickErr) throw pickErr

  // ── 2. Build lookup maps ──────────────────────────────────────────────
  const fixtureById  = new Map<number, Fixture>()   // fixture_id   → fixture (for groups)
  const fixtureByPos = new Map<string, Fixture>()   // bracket_pos  → fixture (for knockout)

  for (const f of fixtures ?? []) {
    const fx = f as Fixture
    fixtureById.set(fx.id, fx)
    if (fx.bracket_position) fixtureByPos.set(fx.bracket_position, fx)
  }

  // ── 3. Score predictions (group stage) ───────────────────────────────
  type PredScore = {
    id: string
    quiniela_id: string
    points_earned: number
    exact: boolean
    winner: boolean
  }

  const scoredPreds: PredScore[] = []
  for (const pred of preds ?? []) {
    const fixture = fixtureById.get(pred.fixture_id)
    if (!fixture) {
      scoredPreds.push({ id: pred.id, quiniela_id: pred.quiniela_id, points_earned: 0, exact: false, winner: false })
      continue
    }
    const r = calculatePredictionScore(fixture, pred as Prediction)
    scoredPreds.push({
      id:             pred.id,
      quiniela_id:    pred.quiniela_id,
      points_earned:  r.points,
      exact:          r.breakdown.exact,
      winner:         !r.breakdown.exact && r.breakdown.base === 2,
    })
  }

  // ── 4. Batch-update predictions ───────────────────────────────────────
  const BATCH = 30
  for (let i = 0; i < scoredPreds.length; i += BATCH) {
    const batch = scoredPreds.slice(i, i + BATCH)
    await Promise.all(
      batch.map(({ id, points_earned }) =>
        supabase.from("predictions").update({ points_earned }).eq("id", id)
      )
    )
  }

  // ── 5. Score bracket_picks (knockout) ─────────────────────────────────
  // Bridge: bracket_picks.slot_key ↔ fixtures.bracket_position
  // Only picks whose slot has a real finished fixture can score.
  type PickScore = { id: string; quiniela_id: string; points_earned: number }

  const scoredPicks: PickScore[] = []
  for (const pick of picks ?? []) {
    const fixture = fixtureByPos.get(pick.slot_key)
    if (!fixture) {
      // Fixture not published yet (or no result) — keep at 0
      scoredPicks.push({ id: pick.id, quiniela_id: pick.quiniela_id, points_earned: 0 })
      continue
    }

    // Synthesize a Prediction-shaped object so calculatePredictionScore works unchanged
    const syntheticPred: Prediction = {
      id:                  pick.id,
      quiniela_id:         pick.quiniela_id,
      fixture_id:          fixture.id,
      home_score_pred:     pick.home_score_pred,
      away_score_pred:     pick.away_score_pred,
      predicts_penalties:  pick.predicts_penalties,
      penalties_winner:    pick.penalties_winner,
      points_earned:       pick.points_earned,
      created_at:          pick.created_at,
      updated_at:          pick.updated_at,
    }

    const r = calculatePredictionScore(fixture, syntheticPred)
    scoredPicks.push({ id: pick.id, quiniela_id: pick.quiniela_id, points_earned: r.points })
  }

  // ── 6. Batch-update bracket_picks ─────────────────────────────────────
  for (let i = 0; i < scoredPicks.length; i += BATCH) {
    const batch = scoredPicks.slice(i, i + BATCH)
    await Promise.all(
      batch.map(({ id, points_earned }) =>
        supabase.from("bracket_picks").update({ points_earned }).eq("id", id)
      )
    )
  }

  // ── 7. Aggregate per quiniela (groups + knockout) ─────────────────────
  const agg = new Map<string, { total: number; exact: number; winners: number }>()

  for (const s of scoredPreds) {
    const a = agg.get(s.quiniela_id) ?? { total: 0, exact: 0, winners: 0 }
    a.total += s.points_earned
    if (s.exact)        a.exact++
    else if (s.winner)  a.winners++
    agg.set(s.quiniela_id, a)
  }

  for (const s of scoredPicks) {
    const a = agg.get(s.quiniela_id) ?? { total: 0, exact: 0, winners: 0 }
    a.total += s.points_earned
    agg.set(s.quiniela_id, a)
  }

  // ── 8. Load quinielas → add bonus → write totals ──────────────────────
  const { data: quinielas } = await supabase
    .from("quinielas")
    .select("id, top_scorer_points, most_goals_team_points")

  for (const q of quinielas ?? []) {
    const qa = agg.get(q.id) ?? { total: 0, exact: 0, winners: 0 }
    const bonus =
      (q.top_scorer_points    ?? 0) +
      (q.most_goals_team_points ?? 0)

    await supabase
      .from("quinielas")
      .update({
        total_points:    qa.total + bonus,
        exact_results:   qa.exact,
        correct_winners: qa.winners,
        updated_at:      new Date().toISOString(),
      })
      .eq("id", q.id)
  }

  return { predictions: scoredPreds.length, quinielas: quinielas?.length ?? 0 }
}
