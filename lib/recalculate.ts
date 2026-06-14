import type { SupabaseClient } from "@supabase/supabase-js"
import { calculatePredictionScore } from "./scoring"
import { fetchAllRows } from "./db-utils"
import type { Fixture, Prediction, Phase } from "./types"
import { PHASE_MULTIPLIER } from "./types"

function resolveWinnerId(
  homeId: number | null, awayId: number | null,
  homeScore: number, awayScore: number,
  penaltiesWinner: string | null
): number | null {
  if (homeScore > awayScore) return homeId
  if (awayScore > homeScore) return awayId
  if (penaltiesWinner === "home") return homeId
  if (penaltiesWinner === "away") return awayId
  return null
}

export async function recalculateAllPoints(
  supabase: SupabaseClient
): Promise<{ predictions: number; quinielas: number; warnings: string[] }> {
  const warnings: string[] = []

  // ── 0. Sanity-count before fetching (detects truncation if fetchAllRows ever breaks) ──
  const { count: dbPredCount } = await supabase
    .from("predictions")
    .select("*", { count: "exact", head: true })
  const { count: dbQCount } = await supabase
    .from("quinielas")
    .select("*", { count: "exact", head: true })

  console.log(`[recalculate] DB totals — predictions: ${dbPredCount}, quinielas: ${dbQCount}`)

  // ── 1. Load finished fixtures + all predictions + all bracket_picks ───
  // fixtures: 104 max for a World Cup — no pagination needed.
  // predictions, bracket_picks, quinielas: paginated via fetchAllRows.
  const { data: fixturesRaw, error: fErr } = await supabase
    .from("fixtures")
    .select("*")
    .not("home_score", "is", null)
    .not("away_score", "is", null)
  if (fErr) throw fErr

  const [preds, picks] = await Promise.all([
    fetchAllRows<Prediction>((from, to) =>
      supabase.from("predictions").select("*").range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase.from("bracket_picks").select("*").range(from, to)
    ),
  ])

  const fixtures = fixturesRaw ?? []

  console.log(`[recalculate] Fetched — fixtures: ${fixtures.length}, predictions: ${preds.length}, bracket_picks: ${picks.length}`)

  // Warn if we fetched fewer predictions than the DB reports
  if (dbPredCount !== null && preds.length < dbPredCount) {
    const msg = `WARNING: fetched ${preds.length} predictions but DB count is ${dbPredCount}`
    console.warn(`[recalculate] ${msg}`)
    warnings.push(msg)
  }

  // ── 2. Build lookup maps ──────────────────────────────────────────────
  const fixtureById  = new Map<number, Fixture>()   // fixture_id   → fixture (for groups)
  const fixtureByPos = new Map<string, Fixture>()   // bracket_pos  → fixture (for knockout)

  for (const f of fixtures) {
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
  let predsWithFixture = 0
  for (const pred of preds) {
    const fixture = fixtureById.get(pred.fixture_id)
    if (!fixture) {
      scoredPreds.push({ id: pred.id, quiniela_id: pred.quiniela_id, points_earned: 0, exact: false, winner: false })
      continue
    }
    predsWithFixture++
    const r = calculatePredictionScore(fixture, pred as Prediction)
    scoredPreds.push({
      id:             pred.id,
      quiniela_id:    pred.quiniela_id,
      points_earned:  r.points,
      exact:          r.breakdown.exact,
      winner:         r.breakdown.correctWinner,
    })
  }

  console.log(`[recalculate] Scored ${predsWithFixture} predictions with results (${preds.length - predsWithFixture} pending/no fixture)`)

  // ── 4. Batch-update predictions ───────────────────────────────────────
  const BATCH = 30
  let predBatches = 0
  for (let i = 0; i < scoredPreds.length; i += BATCH) {
    const batch = scoredPreds.slice(i, i + BATCH)
    await Promise.all(
      batch.map(({ id, points_earned }) =>
        supabase.from("predictions").update({ points_earned }).eq("id", id)
      )
    )
    predBatches++
  }

  console.log(`[recalculate] Updated predictions in ${predBatches} batches of ${BATCH}`)

  // ── 5. Score bracket_picks (knockout) ─────────────────────────────────
  // Team validation:
  //   • picks with team IDs + matching teams → full scoring via calculatePredictionScore
  //   • picks with team IDs + mismatched teams → 3*multiplier if predicted winner played and won, else 0
  //   • legacy picks (no team IDs) → winner direction only, never exact
  type PickScore = { id: string; quiniela_id: string; points_earned: number; exact: boolean; winner: boolean }

  const scoredPicks: PickScore[] = []
  for (const pick of picks) {
    const fixture = fixtureByPos.get(pick.slot_key)
    if (!fixture) {
      scoredPicks.push({ id: pick.id, quiniela_id: pick.quiniela_id, points_earned: 0, exact: false, winner: false })
      continue
    }

    const phase = (fixture.phase ?? "groups") as Phase
    const multiplier = PHASE_MULTIPLIER[phase] ?? 1

    const actualWinnerId = resolveWinnerId(
      fixture.home_team_id, fixture.away_team_id,
      fixture.home_score!, fixture.away_score!,
      fixture.penalties_winner
    )

    const hasTeamIds = pick.home_team_id_pred != null && pick.away_team_id_pred != null
    const fixtureHasTeams = fixture.home_team_id != null && fixture.away_team_id != null

    if (!hasTeamIds || !fixtureHasTeams) {
      // Legacy: winner direction only, never exact
      if (pick.home_score_pred == null || pick.away_score_pred == null) {
        scoredPicks.push({ id: pick.id, quiniela_id: pick.quiniela_id, points_earned: 0, exact: false, winner: false })
        continue
      }
      const hPred = pick.home_score_pred, aPred = pick.away_score_pred
      const actualH = fixture.home_score!, actualA = fixture.away_score!
      const predDir = hPred > aPred ? "home" : aPred > hPred ? "away" : "draw"
      const actualDir = actualH > actualA ? "home" : actualA > actualH ? "away" : "draw"
      let correctWinner = false
      if (predDir === actualDir) {
        if (predDir !== "draw") {
          correctWinner = true
        } else if (fixture.went_to_penalties && pick.penalties_winner) {
          correctWinner = pick.penalties_winner === fixture.penalties_winner
        }
      }
      scoredPicks.push({
        id: pick.id, quiniela_id: pick.quiniela_id,
        points_earned: correctWinner ? 3 * multiplier : 0,
        exact: false, winner: correctWinner,
      })
      continue
    }

    const teamsMatch =
      pick.home_team_id_pred === fixture.home_team_id &&
      pick.away_team_id_pred === fixture.away_team_id

    if (teamsMatch) {
      // Full scoring
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
      scoredPicks.push({
        id: pick.id, quiniela_id: pick.quiniela_id,
        points_earned: r.points,
        exact: r.breakdown.exact, winner: r.breakdown.correctWinner,
      })
    } else {
      // Teams differ: check if predicted winner actually won
      if (pick.home_score_pred == null || pick.away_score_pred == null) {
        scoredPicks.push({ id: pick.id, quiniela_id: pick.quiniela_id, points_earned: 0, exact: false, winner: false })
        continue
      }
      const hPred = pick.home_score_pred, aPred = pick.away_score_pred
      let predictedWinnerId: number | null = null
      if (hPred > aPred)                            predictedWinnerId = pick.home_team_id_pred
      else if (aPred > hPred)                       predictedWinnerId = pick.away_team_id_pred
      else if (pick.penalties_winner === "home")    predictedWinnerId = pick.home_team_id_pred
      else if (pick.penalties_winner === "away")    predictedWinnerId = pick.away_team_id_pred
      const correctWinner = predictedWinnerId != null && predictedWinnerId === actualWinnerId
      scoredPicks.push({
        id: pick.id, quiniela_id: pick.quiniela_id,
        points_earned: correctWinner ? 3 * multiplier : 0,
        exact: false, winner: correctWinner,
      })
    }
  }

  // ── 6. Batch-update bracket_picks ─────────────────────────────────────
  let pickBatches = 0
  for (let i = 0; i < scoredPicks.length; i += BATCH) {
    const batch = scoredPicks.slice(i, i + BATCH)
    await Promise.all(
      batch.map(({ id, points_earned }) =>
        supabase.from("bracket_picks").update({ points_earned }).eq("id", id)
      )
    )
    pickBatches++
  }

  console.log(`[recalculate] Updated ${picks.length} bracket_picks in ${pickBatches} batches`)

  // ── 7. Aggregate per quiniela (groups + knockout) ─────────────────────
  const agg = new Map<string, { total: number; exact: number; winners: number }>()

  for (const s of scoredPreds) {
    const a = agg.get(s.quiniela_id) ?? { total: 0, exact: 0, winners: 0 }
    a.total += s.points_earned
    if (s.exact)   a.exact++
    if (s.winner)  a.winners++   // exact also sets winner=true → counts in both columns
    agg.set(s.quiniela_id, a)
  }

  for (const s of scoredPicks) {
    const a = agg.get(s.quiniela_id) ?? { total: 0, exact: 0, winners: 0 }
    a.total += s.points_earned
    if (s.exact)   a.exact++
    if (s.winner)  a.winners++   // exact also sets winner=true → counts in both columns
    agg.set(s.quiniela_id, a)
  }

  // ── 8. Load ALL quinielas → add bonus → write totals ─────────────────
  const quinielas = await fetchAllRows<{
    id: string
    top_scorer_points: number | null
    most_goals_team_points: number | null
  }>((from, to) =>
    supabase
      .from("quinielas")
      .select("id, top_scorer_points, most_goals_team_points")
      .range(from, to)
  )

  if (dbQCount !== null && quinielas.length < dbQCount) {
    const msg = `WARNING: fetched ${quinielas.length} quinielas but DB count is ${dbQCount}`
    console.warn(`[recalculate] ${msg}`)
    warnings.push(msg)
  }

  let quinielajBatches = 0
  for (const q of quinielas) {
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
    quinielajBatches++
  }

  console.log(`[recalculate] Wrote totals to ${quinielas.length} quinielas (${quinielajBatches} updates)`)
  if (warnings.length > 0) {
    console.warn(`[recalculate] Completed with ${warnings.length} warning(s):`, warnings)
  } else {
    console.log(`[recalculate] Completed successfully — no warnings`)
  }

  return { predictions: preds.length, quinielas: quinielas.length, warnings }
}
