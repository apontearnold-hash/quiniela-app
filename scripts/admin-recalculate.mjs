/**
 * scripts/admin-recalculate.mjs
 *
 * Full recalculate: scores all predictions + bracket_picks,
 * then updates quiniela totals. Same logic as /api/admin/recalculate.
 *
 * Usage: node scripts/admin-recalculate.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let SUPABASE_URL = null, SERVICE_KEY = null
try {
  const lines = readFileSync(join(__dirname, '../.env.local'), 'utf8').split('\n')
  for (const line of lines) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const [k, ...rest] = t.split('=')
    const val = rest.join('=').trim().replace(/^["']|["']$/g, '')
    if (k.trim() === 'NEXT_PUBLIC_SUPABASE_URL') SUPABASE_URL = val
    if (k.trim() === 'SUPABASE_SERVICE_ROLE_KEY') SERVICE_KEY = val
  }
} catch { console.error('❌ No se pudo leer .env.local'); process.exit(1) }
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('❌ Faltan vars'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const PHASE_MULTIPLIER = {
  groups: 1, round_of_32: 2, round_of_16: 3,
  quarterfinals: 4, semifinals: 5, final: 6,
}

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

function resolveWinnerId(homeId, awayId, homeScore, awayScore, penaltiesWinner) {
  if (homeScore > awayScore) return homeId
  if (awayScore > homeScore) return awayId
  if (penaltiesWinner === 'home') return homeId
  if (penaltiesWinner === 'away') return awayId
  return null
}

function scorePrediction(fixture, pred) {
  const phase = fixture.phase ?? 'groups'
  const multiplier = PHASE_MULTIPLIER[phase] ?? 1
  const { home_score, away_score } = fixture
  const { home_score_pred, away_score_pred } = pred
  if (home_score == null || away_score == null || home_score_pred == null || away_score_pred == null) {
    return { points: 0, exact: false, winner: false }
  }
  let actualWinner
  if (home_score > away_score) actualWinner = 'home'
  else if (away_score > home_score) actualWinner = 'away'
  else if (fixture.went_to_penalties && fixture.penalties_winner === 'home') actualWinner = 'home'
  else if (fixture.went_to_penalties && fixture.penalties_winner === 'away') actualWinner = 'away'
  else actualWinner = 'draw'

  let predWinner
  if (home_score_pred > away_score_pred) predWinner = 'home'
  else if (away_score_pred > home_score_pred) predWinner = 'away'
  else if (pred.predicts_penalties && pred.penalties_winner === 'home') predWinner = 'home'
  else if (pred.predicts_penalties && pred.penalties_winner === 'away') predWinner = 'away'
  else predWinner = 'draw'

  if (actualWinner !== predWinner) return { points: 0, exact: false, winner: false }
  const exact = home_score_pred === home_score && away_score_pred === away_score
  return { points: (exact ? 5 : 3) * multiplier, exact, winner: true }
}

function scorePick(fixture, pick) {
  const phase = fixture.phase ?? 'groups'
  const multiplier = PHASE_MULTIPLIER[phase] ?? 1
  const actualWinnerId = resolveWinnerId(
    fixture.home_team_id, fixture.away_team_id,
    fixture.home_score, fixture.away_score, fixture.penalties_winner
  )
  const hasTeamIds = pick.home_team_id_pred != null && pick.away_team_id_pred != null
  const fixtureHasTeams = fixture.home_team_id != null && fixture.away_team_id != null

  if (!hasTeamIds || !fixtureHasTeams) {
    if (pick.home_score_pred == null || pick.away_score_pred == null) return { points: 0, exact: false, winner: false }
    const hPred = pick.home_score_pred, aPred = pick.away_score_pred
    const actualH = fixture.home_score, actualA = fixture.away_score
    let predDir
    if (hPred > aPred) predDir = 'home'
    else if (aPred > hPred) predDir = 'away'
    else if (pick.predicts_penalties && pick.penalties_winner === 'home') predDir = 'home'
    else if (pick.predicts_penalties && pick.penalties_winner === 'away') predDir = 'away'
    else predDir = 'draw'
    let actualDir
    if (actualH > actualA) actualDir = 'home'
    else if (actualA > actualH) actualDir = 'away'
    else if (fixture.went_to_penalties && fixture.penalties_winner === 'home') actualDir = 'home'
    else if (fixture.went_to_penalties && fixture.penalties_winner === 'away') actualDir = 'away'
    else actualDir = 'draw'
    const cw = predDir === actualDir && predDir !== 'draw'
    return { points: cw ? 3 * multiplier : 0, exact: false, winner: cw }
  }

  const teamsMatch = pick.home_team_id_pred === fixture.home_team_id && pick.away_team_id_pred === fixture.away_team_id
  if (teamsMatch) {
    return scorePrediction(fixture, pick)
  }
  // Teams differ: check predicted winner ID
  if (pick.home_score_pred == null || pick.away_score_pred == null) return { points: 0, exact: false, winner: false }
  const hPred = pick.home_score_pred, aPred = pick.away_score_pred
  let predictedWinnerId = null
  if (hPred > aPred) predictedWinnerId = pick.home_team_id_pred
  else if (aPred > hPred) predictedWinnerId = pick.away_team_id_pred
  else if (pick.penalties_winner === 'home') predictedWinnerId = pick.home_team_id_pred
  else if (pick.penalties_winner === 'away') predictedWinnerId = pick.away_team_id_pred
  const cw = predictedWinnerId != null && predictedWinnerId === actualWinnerId
  return { points: cw ? 3 * multiplier : 0, exact: false, winner: cw }
}

async function main() {
  console.log('\n🔧 Recalculate all points...\n')

  // 1. Finished fixtures
  const { data: fixtures, error: fErr } = await supabase
    .from('fixtures')
    .select('*')
    .eq('status', 'finished')
    .not('home_score', 'is', null)
    .not('away_score', 'is', null)
  if (fErr) throw fErr
  console.log(`Fixtures terminados: ${fixtures.length}`)

  const fixtureById  = new Map(fixtures.map(f => [f.id, f]))
  const fixtureByPos = new Map(fixtures.filter(f => f.bracket_position).map(f => [f.bracket_position, f]))

  // 2. All predictions (group stage)
  const preds = await fetchAllRows((from, to) =>
    supabase.from('predictions').select('id, quiniela_id, fixture_id, home_score_pred, away_score_pred, predicts_penalties, penalties_winner').range(from, to)
  )
  console.log(`Predictions: ${preds.length}`)

  // 3. All bracket_picks
  const picks = await fetchAllRows((from, to) =>
    supabase.from('bracket_picks').select('id, quiniela_id, slot_key, home_team_id_pred, away_team_id_pred, home_score_pred, away_score_pred, predicts_penalties, penalties_winner').range(from, to)
  )
  console.log(`Bracket picks: ${picks.length}`)

  // 4. All quinielas
  const quinielas = await fetchAllRows((from, to) =>
    supabase.from('quinielas').select('id, top_scorer_points, most_goals_team_points, carryover_points').range(from, to)
  )
  console.log(`Quinielas: ${quinielas.length}`)

  // 5. Score predictions
  const agg = new Map()
  const predUpdates = []
  let predScored = 0
  for (const pred of preds) {
    const fixture = fixtureById.get(pred.fixture_id)
    if (!fixture) { predUpdates.push({ id: pred.id, points_earned: 0 }); continue }
    const r = scorePrediction(fixture, pred)
    predUpdates.push({ id: pred.id, quiniela_id: pred.quiniela_id, points_earned: r.points, exact: r.exact, winner: r.winner })
    const a = agg.get(pred.quiniela_id) ?? { total: 0, exact: 0, winners: 0 }
    a.total += r.points; if (r.exact) a.exact++; if (r.winner) a.winners++
    agg.set(pred.quiniela_id, a)
    if (r.points > 0) predScored++
  }
  console.log(`Predictions con puntos: ${predScored}`)

  // 6. Score bracket_picks
  const pickUpdates = []
  let pickScored = 0
  let r32_01_exactCount = 0
  for (const pick of picks) {
    const fixture = fixtureByPos.get(pick.slot_key)
    if (!fixture) { pickUpdates.push({ id: pick.id, points_earned: 0 }); continue }
    const r = scorePick(fixture, pick)
    pickUpdates.push({ id: pick.id, quiniela_id: pick.quiniela_id, slot_key: pick.slot_key, points_earned: r.points, exact: r.exact, winner: r.winner })
    const a = agg.get(pick.quiniela_id) ?? { total: 0, exact: 0, winners: 0 }
    a.total += r.points; if (r.exact) a.exact++; if (r.winner) a.winners++
    agg.set(pick.quiniela_id, a)
    if (r.points > 0) pickScored++
    if (pick.slot_key === 'R32-01' && r.exact) r32_01_exactCount++
  }
  console.log(`Bracket picks con puntos: ${pickScored}`)
  console.log(`R32-01 exact (10 pts): ${r32_01_exactCount}`)

  // 7. Batch-update predictions
  console.log('\n🚀 Actualizando predictions...')
  const BATCH = 50
  let pApplied = 0, pFailed = 0
  for (let i = 0; i < predUpdates.length; i += BATCH) {
    const batch = predUpdates.slice(i, i + BATCH)
    await Promise.all(batch.map(({ id, points_earned }) =>
      supabase.from('predictions').update({ points_earned }).eq('id', id)
        .then(({ error }) => { if (error) pFailed++; else pApplied++ })
    ))
    if ((i + BATCH) % 500 === 0) process.stdout.write(`\r  ${pApplied}/${predUpdates.length}...`)
  }
  console.log(`\n  predictions: ${pApplied} OK, ${pFailed} errores`)

  // 8. Batch-update bracket_picks
  console.log('🚀 Actualizando bracket_picks...')
  let bApplied = 0, bFailed = 0
  for (let i = 0; i < pickUpdates.length; i += BATCH) {
    const batch = pickUpdates.slice(i, i + BATCH)
    await Promise.all(batch.map(({ id, points_earned }) =>
      supabase.from('bracket_picks').update({ points_earned }).eq('id', id)
        .then(({ error }) => { if (error) bFailed++; else bApplied++ })
    ))
    if ((i + BATCH) % 500 === 0) process.stdout.write(`\r  ${bApplied}/${pickUpdates.length}...`)
  }
  console.log(`\n  bracket_picks: ${bApplied} OK, ${bFailed} errores`)

  // 9. Update quiniela totals
  console.log('🚀 Actualizando totales de quinielas...')
  let qApplied = 0, qFailed = 0
  for (const q of quinielas) {
    const qa = agg.get(q.id) ?? { total: 0, exact: 0, winners: 0 }
    const bonus = (q.top_scorer_points ?? 0) + (q.most_goals_team_points ?? 0) + (q.carryover_points ?? 0)
    const { error } = await supabase.from('quinielas').update({
      total_points:    qa.total + bonus,
      exact_results:   qa.exact,
      correct_winners: qa.winners,
    }).eq('id', q.id)
    if (error) { console.error(`  ❌ ${q.id}: ${error.message}`); qFailed++ }
    else qApplied++
  }
  console.log(`  quinielas: ${qApplied} OK, ${qFailed} errores`)

  console.log('\n✅ DONE — Recalculate completo.')
  if (pFailed + bFailed + qFailed > 0) { console.log(`⚠️  ${pFailed + bFailed + qFailed} errores totales`); process.exit(1) }
}

main().catch(err => { console.error(err); process.exit(1) })
