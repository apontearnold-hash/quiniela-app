/**
 * Deeper scoring diagnosis — read-only.
 * Run: node scripts/check-scoring.mjs
 */

import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, "..", ".env.local")

let SUPABASE_URL = null
let SERVICE_KEY  = null

try {
  const lines = readFileSync(envPath, "utf8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const [k, ...rest] = trimmed.split("=")
    const key = k.trim()
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "")
    if (key === "NEXT_PUBLIC_SUPABASE_URL")  SUPABASE_URL = val
    if (key === "SUPABASE_SERVICE_ROLE_KEY") SERVICE_KEY  = val
  }
} catch {
  console.error("❌  No se pudo leer .env.local"); process.exit(1)
}

async function get(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: { "apikey": SERVICE_KEY, "Authorization": `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

console.log("\n═══════════════════════════════════════════════════════")
console.log("  Diagnóstico completo de scoring")
console.log("═══════════════════════════════════════════════════════\n")

// 1. Finished fixtures with phase info
const finishedFixtures = await get("fixtures", {
  select: "id,round,phase,bracket_position,home_score,away_score,home_team_name,away_team_name",
  "home_score": "not.is.null",
  order: "phase.asc",
  limit: "50",
})

console.log(`── Fixtures terminados (${finishedFixtures.length}): ──────────────────\n`)
for (const f of finishedFixtures) {
  const bp = f.bracket_position ? ` | bracket_pos="${f.bracket_position}"` : ""
  console.log(`  [${String(f.id).padStart(8)}] phase=${String(f.phase).padEnd(16)} round="${f.round}"${bp}`)
  console.log(`              ${f.home_team_name} ${f.home_score}–${f.away_score} ${f.away_team_name}`)
}

// 2. bracket_picks table — does it exist and has data?
console.log("\n── bracket_picks ────────────────────────────────────────\n")
try {
  const picks = await get("bracket_picks", { select: "*", limit: "5" })
  console.log(`  ✓ Tabla existe — ${picks.length} filas (limit 5 shown)`)
  for (const p of picks) {
    console.log(`    id=${p.id} | quiniela_id=${p.quiniela_id} | slot_key="${p.slot_key}" | pts=${p.points_earned}`)
    console.log(`    home_pred=${p.home_score_pred} away_pred=${p.away_score_pred}`)
  }
  if (picks.length === 0) console.log("  (sin picks todavía)")
} catch (e) {
  console.log(`  ⚠ Error: ${e.message}`)
}

// 3. predictions table — sample with points
console.log("\n── predictions (muestra con puntos > 0) ─────────────────\n")
try {
  const preds = await get("predictions", {
    select: "id,quiniela_id,fixture_id,home_score_pred,away_score_pred,points_earned",
    "points_earned": "gt.0",
    order: "points_earned.desc",
    limit: "10",
  })
  // Filter client-side in case query param didn't work
  console.log(`  ${preds.length} predictions con puntos (limit 10):`)
  for (const p of preds) {
    console.log(`    pred=${p.home_score_pred}–${p.away_score_pred} | pts=${p.points_earned} | fixture_id=${p.fixture_id}`)
  }
} catch (e) {
  console.log(`  ⚠ Error: ${e.message}`)
}

// 4. quinielas — current totals
console.log("\n── quinielas totales ────────────────────────────────────\n")
try {
  const qs = await get("quinielas", {
    select: "id,name,total_points,exact_results,correct_winners",
    order: "total_points.desc",
    limit: "10",
  })
  console.log(`  ${qs.length} quinielas:`)
  for (const q of qs) {
    console.log(`    "${q.name}" — total=${q.total_points} exact=${q.exact_results} winners=${q.correct_winners}`)
  }
} catch (e) {
  console.log(`  ⚠ Error: ${e.message}`)
}

// 5. Check: any R32 fixture with home_score not null
console.log("\n── R32 fixtures terminados ──────────────────────────────\n")
const r32Finished = finishedFixtures.filter(f => f.phase === 'round_of_32')
if (r32Finished.length === 0) {
  console.log("  (ningún R32 terminado todavía — el bug no aplica aún)")
} else {
  console.log(`  ${r32Finished.length} R32 terminados:`)
  for (const f of r32Finished) {
    console.log(`    ${f.home_team_name} ${f.home_score}–${f.away_score} ${f.away_team_name} | bracket_pos=${f.bracket_position}`)
  }
}

console.log("\n═══════════════════════════════════════════════════════\n")
