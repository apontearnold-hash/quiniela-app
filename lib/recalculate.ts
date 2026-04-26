import type { SupabaseClient } from "@supabase/supabase-js"
import { calculatePredictionScore } from "./scoring"
import type { Fixture, Prediction } from "./types"

export async function recalculateAllPoints(
  supabase: SupabaseClient
): Promise<{ predictions: number; quinielas: number }> {
  // ── 1. Load finished fixtures + all predictions in parallel ──────────
  const [{ data: fixtures, error: fErr }, { data: preds, error: pErr }] = await Promise.all([
    supabase
      .from("fixtures")
      .select("*")
      .not("home_score", "is", null)
      .not("away_score", "is", null),
    supabase.from("predictions").select("*"),
  ])
  if (fErr) throw fErr
  if (pErr) throw pErr

  const fixtureMap = new Map<number, Fixture>()
  for (const f of fixtures ?? []) fixtureMap.set(f.id, f as Fixture)

  // ── 2. Score all predictions in memory (no DB round-trips) ───────────
  type PredScore = {
    id: string
    quiniela_id: string
    points_earned: number
    exact: boolean
    winner: boolean
  }

  const scored: PredScore[] = []
  for (const pred of preds ?? []) {
    const fixture = fixtureMap.get(pred.fixture_id)
    if (!fixture) {
      scored.push({ id: pred.id, quiniela_id: pred.quiniela_id, points_earned: 0, exact: false, winner: false })
      continue
    }
    const r = calculatePredictionScore(fixture, pred as Prediction)
    scored.push({
      id: pred.id,
      quiniela_id: pred.quiniela_id,
      points_earned: r.points,
      exact: r.breakdown.exact,
      winner: !r.breakdown.exact && r.breakdown.base === 2,
    })
  }

  // ── 3. Batch-update predictions in parallel (30 concurrent at a time) ─
  const BATCH = 30
  for (let i = 0; i < scored.length; i += BATCH) {
    const batch = scored.slice(i, i + BATCH)
    await Promise.all(
      batch.map(({ id, points_earned }) =>
        supabase.from("predictions").update({ points_earned }).eq("id", id)
      )
    )
  }

  // ── 4. Aggregate per quiniela in memory ───────────────────────────────
  const agg = new Map<string, { total: number; exact: number; winners: number }>()
  for (const s of scored) {
    const a = agg.get(s.quiniela_id) ?? { total: 0, exact: 0, winners: 0 }
    a.total += s.points_earned
    if (s.exact) a.exact++
    else if (s.winner) a.winners++
    agg.set(s.quiniela_id, a)
  }

  // ── 5. Load quinielas → add bonus points → write totals ──────────────
  const { data: quinielas } = await supabase
    .from("quinielas")
    .select("id, top_scorer_points, most_goals_team_points")

  for (const q of quinielas ?? []) {
    const qa = agg.get(q.id) ?? { total: 0, exact: 0, winners: 0 }
    const bonus =
      (q.top_scorer_points ?? 0) +
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

  // ── Knockout bracket_picks scoring: reserved for Phase 2 ─────────────
  // When API-Football publishes knockout fixtures, match them by
  // fixture.bracket_position ↔ bracket_picks.slot_key and compute scores.
  // bracket_picks.points_earned stays 0 until that data is available.

  return { predictions: scored.length, quinielas: quinielas?.length ?? 0 }
}
