// Runs recalculateAllPoints + recalculateGroupStandings directly via Supabase admin.
// READ-WRITE: updates points/correct_winners/exact_results in DB.
import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = "https://rcwznejeemdhfqnmedxc.supabase.co"
const SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjd3puZWplZW1kaGZxbm1lZHhjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE2MDQ4MiwiZXhwIjoyMDkwNzM2NDgyfQ.LESlAfGJLV9oPTZ0fmD3UM66MHTz5hkUJKBeftGYDoY"

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ── fetchAllRows helper ──────────────────────────────────────────────────────
async function fetchAllRows(fetcher) {
  const PAGE = 1000
  const rows = []
  let offset = 0
  for (;;) {
    const { data, error } = await fetcher(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return rows
}

// ── PHASE_MULTIPLIER (mirrors lib/types.ts) ──────────────────────────────────
const PHASE_MULTIPLIER = {
  groups: 1, round_of_32: 2, round_of_16: 3,
  quarterfinals: 4, semifinals: 5, final: 6,
}

// ── calculatePredictionScore (mirrors lib/scoring.ts with the fix applied) ──
function calculatePredictionScore(fixture, pred) {
  const phase = fixture.phase ?? "groups"
  const multiplier = PHASE_MULTIPLIER[phase] ?? 1

  const { home_score, away_score } = fixture
  const { home_score_pred, away_score_pred } = pred

  if (home_score == null || away_score == null || home_score_pred == null || away_score_pred == null) {
    return { points: 0, breakdown: { exact: false, correctWinner: false } }
  }

  let base = 0, exact = false, correctWinner = false

  if (home_score_pred === home_score && away_score_pred === away_score) {
    base = 5; exact = true; correctWinner = true  // ← fixed: exact → correctWinner = true
  } else {
    const actualW = home_score > away_score ? "home" : away_score > home_score ? "away" : "draw"
    const predW   = home_score_pred > away_score_pred ? "home" : away_score_pred > home_score_pred ? "away" : "draw"
    if (actualW === predW) { base = 3; correctWinner = actualW !== "draw" }
  }

  let penaltyBonus = 0
  if (phase !== "groups" && fixture.went_to_penalties) {
    if (pred.predicts_penalties) {
      penaltyBonus += 3
      if (pred.penalties_winner === fixture.penalties_winner) penaltyBonus += 5
    }
  }

  return { points: base * multiplier + penaltyBonus, breakdown: { exact, correctWinner } }
}

function resolveWinnerId(homeId, awayId, homeScore, awayScore, penaltiesWinner) {
  if (homeScore > awayScore) return homeId
  if (awayScore > homeScore) return awayId
  if (penaltiesWinner === "home") return homeId
  if (penaltiesWinner === "away") return awayId
  return null
}

async function main() {
  console.log("=".repeat(60))
  console.log("RECALCULATE (with corrected exact-score counting)")
  console.log("=".repeat(60))

  // 1. Fetch finished fixtures
  const { data: fixturesRaw, error: fErr } = await admin
    .from("fixtures").select("*")
    .not("home_score", "is", null).not("away_score", "is", null)
  if (fErr) throw fErr
  const fixtures = fixturesRaw ?? []
  console.log(`\nFixtures with results: ${fixtures.length}`)

  // 2. Fetch all predictions + bracket_picks
  const [preds, picks] = await Promise.all([
    fetchAllRows((from, to) => admin.from("predictions").select("*").range(from, to)),
    fetchAllRows((from, to) => admin.from("bracket_picks").select("*").range(from, to)),
  ])
  console.log(`Predictions: ${preds.length}, bracket_picks: ${picks.length}`)

  const fixtureById  = new Map(fixtures.map(f => [f.id, f]))
  const fixtureByPos = new Map(fixtures.filter(f => f.bracket_position).map(f => [f.bracket_position, f]))

  // 3. Score predictions
  const scoredPreds = []
  for (const pred of preds) {
    const fixture = fixtureById.get(pred.fixture_id)
    if (!fixture) { scoredPreds.push({ id: pred.id, quiniela_id: pred.quiniela_id, points_earned: 0, exact: false, winner: false }); continue }
    const r = calculatePredictionScore(fixture, pred)
    scoredPreds.push({ id: pred.id, quiniela_id: pred.quiniela_id, points_earned: r.points, exact: r.breakdown.exact, winner: r.breakdown.correctWinner })
  }

  // 4. Batch-update predictions
  const BATCH = 30
  for (let i = 0; i < scoredPreds.length; i += BATCH) {
    await Promise.all(scoredPreds.slice(i, i + BATCH).map(({ id, points_earned }) =>
      admin.from("predictions").update({ points_earned }).eq("id", id)
    ))
  }
  console.log(`Updated ${scoredPreds.length} predictions`)

  // 5. Score bracket_picks
  const scoredPicks = []
  for (const pick of picks) {
    const fixture = fixtureByPos.get(pick.slot_key)
    if (!fixture) { scoredPicks.push({ id: pick.id, quiniela_id: pick.quiniela_id, points_earned: 0, exact: false, winner: false }); continue }
    const phase = fixture.phase ?? "groups"
    const multiplier = PHASE_MULTIPLIER[phase] ?? 1
    const actualWinnerId = resolveWinnerId(fixture.home_team_id, fixture.away_team_id, fixture.home_score, fixture.away_score, fixture.penalties_winner)
    const hasTeamIds = pick.home_team_id_pred != null && pick.away_team_id_pred != null
    const fixtureHasTeams = fixture.home_team_id != null && fixture.away_team_id != null

    if (!hasTeamIds || !fixtureHasTeams) {
      if (pick.home_score_pred == null || pick.away_score_pred == null) { scoredPicks.push({ id: pick.id, quiniela_id: pick.quiniela_id, points_earned: 0, exact: false, winner: false }); continue }
      const predDir = pick.home_score_pred > pick.away_score_pred ? "home" : pick.away_score_pred > pick.home_score_pred ? "away" : "draw"
      const actDir  = fixture.home_score > fixture.away_score ? "home" : fixture.away_score > fixture.home_score ? "away" : "draw"
      const cw = predDir === actDir && predDir !== "draw"
      scoredPicks.push({ id: pick.id, quiniela_id: pick.quiniela_id, points_earned: cw ? 3 * multiplier : 0, exact: false, winner: cw })
      continue
    }

    const teamsMatch = pick.home_team_id_pred === fixture.home_team_id && pick.away_team_id_pred === fixture.away_team_id
    if (teamsMatch) {
      const synth = { id: pick.id, quiniela_id: pick.quiniela_id, fixture_id: fixture.id, home_score_pred: pick.home_score_pred, away_score_pred: pick.away_score_pred, predicts_penalties: pick.predicts_penalties, penalties_winner: pick.penalties_winner, points_earned: pick.points_earned, created_at: pick.created_at, updated_at: pick.updated_at }
      const r = calculatePredictionScore(fixture, synth)
      scoredPicks.push({ id: pick.id, quiniela_id: pick.quiniela_id, points_earned: r.points, exact: r.breakdown.exact, winner: r.breakdown.correctWinner })
    } else {
      if (pick.home_score_pred == null || pick.away_score_pred == null) { scoredPicks.push({ id: pick.id, quiniela_id: pick.quiniela_id, points_earned: 0, exact: false, winner: false }); continue }
      let predictedWinnerId = null
      if (pick.home_score_pred > pick.away_score_pred)         predictedWinnerId = pick.home_team_id_pred
      else if (pick.away_score_pred > pick.home_score_pred)    predictedWinnerId = pick.away_team_id_pred
      else if (pick.penalties_winner === "home")               predictedWinnerId = pick.home_team_id_pred
      else if (pick.penalties_winner === "away")               predictedWinnerId = pick.away_team_id_pred
      const cw = predictedWinnerId != null && predictedWinnerId === actualWinnerId
      scoredPicks.push({ id: pick.id, quiniela_id: pick.quiniela_id, points_earned: cw ? 3 * multiplier : 0, exact: false, winner: cw })
    }
  }

  for (let i = 0; i < scoredPicks.length; i += BATCH) {
    await Promise.all(scoredPicks.slice(i, i + BATCH).map(({ id, points_earned }) =>
      admin.from("bracket_picks").update({ points_earned }).eq("id", id)
    ))
  }
  console.log(`Updated ${scoredPicks.length} bracket_picks`)

  // 6. Aggregate per quiniela — fixed: if (exact) AND if (winner) separately
  const agg = new Map()
  for (const s of [...scoredPreds, ...scoredPicks]) {
    const a = agg.get(s.quiniela_id) ?? { total: 0, exact: 0, winners: 0 }
    a.total += s.points_earned
    if (s.exact)   a.exact++
    if (s.winner)  a.winners++   // ← fixed: no longer else-if
    agg.set(s.quiniela_id, a)
  }

  // 7. Load quinielas + write totals
  const quinielas = await fetchAllRows((from, to) =>
    admin.from("quinielas").select("id, top_scorer_points, most_goals_team_points").range(from, to)
  )
  console.log(`Quinielas to update: ${quinielas.length}`)

  let updated = 0
  for (const q of quinielas) {
    const qa = agg.get(q.id) ?? { total: 0, exact: 0, winners: 0 }
    const bonus = (q.top_scorer_points ?? 0) + (q.most_goals_team_points ?? 0)
    const { error } = await admin.from("quinielas").update({
      total_points:    qa.total + bonus,
      exact_results:   qa.exact,
      correct_winners: qa.winners,
      updated_at:      new Date().toISOString(),
    }).eq("id", q.id)
    if (error) console.error(`  ❌ quiniela ${q.id}: ${error.message}`)
    else updated++
  }

  console.log(`\n✅ Recalculate complete — ${updated}/${quinielas.length} quinielas updated`)
  console.log("=".repeat(60))

  // 8. Sample check: show top 5 by points
  const { data: top5 } = await admin.from("quinielas")
    .select("name, total_points, correct_winners, exact_results")
    .eq("status", "submitted")
    .eq("is_test", false)
    .order("total_points", { ascending: false })
    .limit(5)
  console.log("\nTop 5 quinielas after recalculate:")
  top5?.forEach((q, i) => {
    console.log(`  ${i+1}. "${q.name}" — PTS:${q.total_points} Aciertos:${q.correct_winners} Exactos:${q.exact_results}`)
  })
}

main().catch(e => { console.error(e); process.exit(1) })
