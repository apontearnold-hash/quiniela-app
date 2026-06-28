/**
 * scripts/rebuild-bracket-picks.mjs
 *
 * Rebuilds R16/QF/SF/3P/FIN team fields in bracket_picks from scratch,
 * using current R32 fixture teams + each quiniela's own R32 score picks.
 *
 * Source of truth:
 *   1. R32 teams  → DB fixtures table (already corrected)
 *   2. Winners    → predicted by home_score_pred vs away_score_pred + penalties picks
 *   3. Connections→ bracket-slots.ts structure (hardcoded below)
 *
 * NEVER touches: home_score_pred, away_score_pred, predicts_penalties,
 *                penalties_winner, group predictions, points, ranking,
 *                quiniela status.
 *
 * Usage:
 *   node scripts/rebuild-bracket-picks.mjs             # dry-run (default)
 *   node scripts/rebuild-bracket-picks.mjs --apply     # apply changes
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Read .env.local without dotenv
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
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const DRY_RUN = !process.argv.includes('--apply')

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ── Official bracket connections (from bracket-slots.ts) ─────────────────────
// Format: { home: 'winner:SLOT' | 'loser:SLOT', away: ... }
const CONNECTIONS = {
  // Connections per official FIFA.com bracket (M89=M74vM77, M94=M81vM82, M96=M85vM87)
  'R16-01': { home: 'winner:R32-05', away: 'winner:R32-13' }, // M89: Germany/Paraguay vs France/Sweden
  'R16-02': { home: 'winner:R32-01', away: 'winner:R32-03' }, // M90: SAfrica/Canada vs Netherlands/Morocco
  'R16-03': { home: 'winner:R32-04', away: 'winner:R32-06' }, // M91: Brazil/Japan vs IvoryC/Norway
  'R16-04': { home: 'winner:R32-07', away: 'winner:R32-08' }, // M92: Mexico/Ecuador vs England/Congo
  'R16-05': { home: 'winner:R32-11', away: 'winner:R32-12' }, // M93: Portugal/Croatia vs Spain/Austria
  'R16-06': { home: 'winner:R32-02', away: 'winner:R32-09' }, // M94: USA/Bosnia vs Belgium/Senegal
  'R16-07': { home: 'winner:R32-14', away: 'winner:R32-16' }, // M95: Argentina/Cabo Verde vs Australia/Egypt
  'R16-08': { home: 'winner:R32-10', away: 'winner:R32-15' }, // M96: Switzerland/Algeria vs Colombia/Ghana
  'QF-01':  { home: 'winner:R16-01', away: 'winner:R16-02' },
  'QF-02':  { home: 'winner:R16-05', away: 'winner:R16-06' },
  'QF-03':  { home: 'winner:R16-03', away: 'winner:R16-04' },
  'QF-04':  { home: 'winner:R16-07', away: 'winner:R16-08' },
  'SF-01':  { home: 'winner:QF-01',  away: 'winner:QF-02'  },
  'SF-02':  { home: 'winner:QF-03',  away: 'winner:QF-04'  },
  '3P':     { home: 'loser:SF-01',   away: 'loser:SF-02'   },
  'FIN':    { home: 'winner:SF-01',  away: 'winner:SF-02'  },
}

// Process order matters: each phase depends on the previous
const PHASE_ORDER = [
  ['R16-01','R16-02','R16-03','R16-04','R16-05','R16-06','R16-07','R16-08'],
  ['QF-01','QF-02','QF-03','QF-04'],
  ['SF-01','SF-02'],
  ['3P','FIN'],
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveTeam(source, winnerMap, loserMap) {
  const colon = source.indexOf(':')
  const type = source.slice(0, colon)
  const slot = source.slice(colon + 1)
  return type === 'winner' ? (winnerMap.get(slot) ?? null)
       : type === 'loser'  ? (loserMap.get(slot) ?? null)
       : null
}

// Given a pick and the actual home/away teams, determine predicted winner/loser.
// Returns { winner, loser } or null if undetermined.
function predictOutcome(pick, homeTeam, awayTeam) {
  if (!pick || pick.home_score_pred == null || pick.away_score_pred == null) return null
  const h = pick.home_score_pred, a = pick.away_score_pred
  if (h > a) return { winner: homeTeam, loser: awayTeam }
  if (a > h) return { winner: awayTeam, loser: homeTeam }
  if (pick.predicts_penalties && pick.penalties_winner === 'home') return { winner: homeTeam, loser: awayTeam }
  if (pick.predicts_penalties && pick.penalties_winner === 'away') return { winner: awayTeam, loser: homeTeam }
  return null
}

function phaseBucket(slotKey) {
  if (slotKey.startsWith('R16')) return 'R16'
  if (slotKey.startsWith('QF'))  return 'QF'
  if (slotKey.startsWith('SF'))  return 'SF'
  return '3P/FIN'
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧 Bracket picks rebuild — ${DRY_RUN ? 'DRY RUN (no changes)' : '⚠️  APPLYING CHANGES'}\n`)

  // 1. Load R32 fixtures from DB
  const { data: r32Rows, error: r32Err } = await supabase
    .from('fixtures')
    .select('bracket_position, home_team_id, home_team_name, home_team_flag, away_team_id, away_team_name, away_team_flag')
    .eq('phase', 'round_of_32')
    .not('bracket_position', 'is', null)
  if (r32Err) throw r32Err

  const r32Fixtures = new Map()
  for (const f of r32Rows) {
    r32Fixtures.set(f.bracket_position, {
      home: { id: f.home_team_id, name: f.home_team_name, flag: f.home_team_flag ?? null },
      away: { id: f.away_team_id, name: f.away_team_name, flag: f.away_team_flag ?? null },
    })
  }
  console.log(`R32 fixtures: ${r32Fixtures.size}/16 loaded`)
  for (const [k, v] of [...r32Fixtures.entries()].sort()) {
    console.log(`  ${k}: ${v.home.name} vs ${v.away.name}`)
  }

  // 2. Load all quinielas
  const { data: quinielas, error: qErr } = await supabase
    .from('quinielas')
    .select('id, name, champion_team_name, champion_team_flag')
  if (qErr) throw qErr
  console.log(`\nQuinielas: ${quinielas.length} loaded`)

  // 3. Load R32 bracket_picks (for winner determination only)
  const { data: r32PickRows, error: rp32Err } = await supabase
    .from('bracket_picks')
    .select('quiniela_id, slot_key, home_score_pred, away_score_pred, predicts_penalties, penalties_winner')
    .like('slot_key', 'R32-%')
  if (rp32Err) throw rp32Err

  // 4. Load R16/QF/SF/3P/FIN bracket_picks (team names to update + scores to preserve)
  const { data: laterPickRows, error: lpErr } = await supabase
    .from('bracket_picks')
    .select('id, quiniela_id, slot_key, home_team_id_pred, home_team_name_pred, home_team_flag_pred, away_team_id_pred, away_team_name_pred, away_team_flag_pred, home_score_pred, away_score_pred, predicts_penalties, penalties_winner')
    .not('slot_key', 'like', 'R32-%')
  if (lpErr) throw lpErr

  console.log(`R32 picks: ${r32PickRows.length} | R16+ picks: ${laterPickRows.length}`)

  // Group by quiniela
  const r32PicksByQ = new Map()
  for (const p of r32PickRows) {
    if (!r32PicksByQ.has(p.quiniela_id)) r32PicksByQ.set(p.quiniela_id, new Map())
    r32PicksByQ.get(p.quiniela_id).set(p.slot_key, p)
  }
  const laterPicksByQ = new Map()
  for (const p of laterPickRows) {
    if (!laterPicksByQ.has(p.quiniela_id)) laterPicksByQ.set(p.quiniela_id, new Map())
    laterPicksByQ.get(p.quiniela_id).set(p.slot_key, p)
  }

  // 5. Simulate bracket for each quiniela
  const summary = { 'R16': 0, 'QF': 0, 'SF': 0, '3P/FIN': 0 }
  const updates = []        // { id, quiniela_id, slot_key, old, new, patch }
  const champUpdates = []   // { quiniela_id, name, old_champ, new_champ, flag }
  const examples = []       // up to 3 before/after examples

  for (const q of quinielas) {
    const r32PicksQ = r32PicksByQ.get(q.id) ?? new Map()
    const laterPicksQ = laterPicksByQ.get(q.id) ?? new Map()

    // Maps track the team that won/lost each slot for this quiniela
    const winnerMap = new Map()  // slot_key → { id, name, flag }
    const loserMap  = new Map()

    // ── Seed winnerMap with R32 outcomes ──────────────────────────────────
    for (const [slotKey, teams] of r32Fixtures) {
      const pick = r32PicksQ.get(slotKey)
      const outcome = predictOutcome(pick, teams.home, teams.away)
      if (outcome) {
        winnerMap.set(slotKey, outcome.winner)
        loserMap.set(slotKey, outcome.loser)
      }
    }

    // ── Process R16 → QF → SF → 3P/FIN ───────────────────────────────────
    for (const phase of PHASE_ORDER) {
      for (const slotKey of phase) {
        const conn = CONNECTIONS[slotKey]
        const newHome = resolveTeam(conn.home, winnerMap, loserMap)
        const newAway = resolveTeam(conn.away, winnerMap, loserMap)

        // Register this slot's outcome for the next phase
        const pick = laterPicksQ.get(slotKey)
        if (newHome && newAway && pick) {
          const outcome = predictOutcome(pick, newHome, newAway)
          if (outcome) {
            winnerMap.set(slotKey, outcome.winner)
            loserMap.set(slotKey, outcome.loser)
          }
        }

        // Determine if team fields need updating
        if (!pick || !newHome || !newAway) continue

        const homeChanged = pick.home_team_id_pred !== newHome.id
          || pick.home_team_name_pred !== newHome.name
          || pick.home_team_flag_pred !== newHome.flag
        const awayChanged = pick.away_team_id_pred !== newAway.id
          || pick.away_team_name_pred !== newAway.name
          || pick.away_team_flag_pred !== newAway.flag

        if (!homeChanged && !awayChanged) continue

        const bucket = phaseBucket(slotKey)
        summary[bucket]++

        const u = {
          id: pick.id,
          quiniela_id: q.id,
          quiniela_name: q.name,
          slot_key: slotKey,
          old: {
            home: pick.home_team_name_pred ?? '(null)',
            away: pick.away_team_name_pred ?? '(null)',
          },
          new: { home: newHome.name, away: newAway.name },
          // Scores/penalties untouched — only these 6 fields change:
          patch: {
            home_team_id_pred:   newHome.id,
            home_team_name_pred: newHome.name,
            home_team_flag_pred: newHome.flag,
            away_team_id_pred:   newAway.id,
            away_team_name_pred: newAway.name,
            away_team_flag_pred: newAway.flag,
          },
        }
        updates.push(u)

        // Collect examples: NPI always, then first 2 more unique quinielas
        const alreadyHasNPI = examples.some(e => e.quiniela_name === 'NPI')
        const isNPI = q.name === 'NPI'
        const quinielasInExamples = new Set(examples.map(e => e.quiniela_name))
        if (isNPI && !alreadyHasNPI) {
          examples.unshift(u)
        } else if (!isNPI && quinielasInExamples.size < (alreadyHasNPI ? 3 : 2) && !quinielasInExamples.has(q.name)) {
          examples.push(u)
        }
      }
    }

    // ── Champion sync from FIN winner ─────────────────────────────────────
    const finWinner = winnerMap.get('FIN')
    if (finWinner && q.champion_team_name !== finWinner.name) {
      champUpdates.push({
        quiniela_id: q.id,
        quiniela_name: q.name,
        old_champ: q.champion_team_name,
        new_champ: finWinner.name,
        flag: finWinner.flag,
      })
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const total = Object.values(summary).reduce((a,b) => a+b, 0)
  console.log('\n═══════════════════════════════════════════════════')
  console.log('  RESUMEN DE CAMBIOS POR FASE (bracket_picks)')
  console.log('═══════════════════════════════════════════════════')
  console.log(`  R16:    ${summary['R16']} picks a actualizar`)
  console.log(`  QF:     ${summary['QF']} picks a actualizar`)
  console.log(`  SF:     ${summary['SF']} picks a actualizar`)
  console.log(`  3P/FIN: ${summary['3P/FIN']} picks a actualizar`)
  console.log(`  ─────────────────────────────────────────────────`)
  console.log(`  TOTAL:  ${total} bracket_picks`)
  console.log(`  Champion sync: ${champUpdates.length} quinielas`)

  console.log('\n═══════════════════════════════════════════════════')
  console.log('  EJEMPLOS ANTES / DESPUÉS')
  console.log('═══════════════════════════════════════════════════')
  for (const ex of examples.slice(0, 3)) {
    console.log(`  [${ex.quiniela_name}] ${ex.slot_key}:`)
    console.log(`    ANTES:   ${ex.old.home} vs ${ex.old.away}`)
    console.log(`    DESPUÉS: ${ex.new.home} vs ${ex.new.away}`)
    console.log(`    Scores/penales: NO TOCADOS`)
  }

  if (champUpdates.length > 0) {
    console.log('\n═══════════════════════════════════════════════════')
    console.log('  CHAMPION SYNC')
    console.log('═══════════════════════════════════════════════════')
    for (const cu of champUpdates) {
      console.log(`  [${cu.quiniela_name}]: ${cu.old_champ ?? '(null)'} → ${cu.new_champ}`)
    }
  }

  console.log('\n✅ CAMPOS QUE NO SE MODIFICAN:')
  console.log('  home_score_pred, away_score_pred, predicts_penalties, penalties_winner')
  console.log('  predictions de grupos, puntos, ranking, status, knockout_editing_open')

  if (DRY_RUN) {
    console.log('\n🔎 DRY RUN — nada fue modificado.')
    console.log('   Para aplicar: node scripts/rebuild-bracket-picks.mjs --apply')
    return
  }

  // ── Apply ─────────────────────────────────────────────────────────────────
  console.log('\n🚀 Aplicando cambios en bracket_picks...')
  let applied = 0, failed = 0
  const BATCH = 50
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH)
    for (const u of batch) {
      const { error } = await supabase
        .from('bracket_picks')
        .update(u.patch)
        .eq('id', u.id)
      if (error) {
        console.error(`\n  ❌ [${u.quiniela_name}] ${u.slot_key}: ${error.message}`)
        failed++
      } else {
        applied++
        if (applied % 50 === 0) process.stdout.write(`\r  ${applied}/${updates.length}...`)
      }
    }
  }
  console.log(`\n  bracket_picks: ${applied} aplicados, ${failed} fallidos`)

  // Champion sync
  let champApplied = 0, champFailed = 0
  console.log('\n🚀 Sincronizando campeones...')
  for (const cu of champUpdates) {
    const { error } = await supabase
      .from('quinielas')
      .update({ champion_team_name: cu.new_champ, champion_team_flag: cu.flag })
      .eq('id', cu.quiniela_id)
    if (error) {
      console.error(`  ❌ [${cu.quiniela_name}]: ${error.message}`)
      champFailed++
    } else {
      console.log(`  ✅ [${cu.quiniela_name}]: ${cu.old_champ ?? 'null'} → ${cu.new_champ}`)
      champApplied++
    }
  }

  console.log(`\n✅ DONE: ${applied} bracket_picks, ${champApplied} campeones actualizados`)
  if (failed + champFailed > 0) {
    console.log(`⚠️  ${failed + champFailed} errores — revisar arriba`)
    process.exit(1)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
