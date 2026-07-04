/**
 * Read-only diagnostic: checks production `fixtures` for the ghost-row
 * pattern that broke the dashboard ticker in July 2026 (knockout results
 * upserted by raw API-Football id instead of the synthetic slot).
 *
 * Run: node scripts/check-ghost-fixtures.mjs
 * Never writes anything — safe to run anytime, including in CI.
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
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌  Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY"); process.exit(1)
}

async function get(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

console.log("\n═══════════════════════════════════════════════════════")
console.log("  Ghost fixture diagnostic (read-only)")
console.log("═══════════════════════════════════════════════════════\n")

let problems = 0

// 1. phase IS NULL — the primary ghost-row signature (real upsert never sets phase)
const phaseNull = await get("fixtures", { select: "id,home_score,away_score,status,updated_at", phase: "is.null" })
if (phaseNull.length === 0) {
  console.log("✅ 0 fixtures con phase IS NULL")
} else {
  problems++
  console.log(`❌ ${phaseNull.length} fixtures con phase IS NULL (filas fantasma):`)
  for (const f of phaseNull) console.log(`   id=${f.id} score=${f.home_score}-${f.away_score} status=${f.status} updated_at=${f.updated_at}`)
}

// 2. kickoff IS NULL among rows that otherwise look like real fixtures (phase not null)
const kickoffNull = await get("fixtures", { select: "id,bracket_position,phase,home_team_name", kickoff: "is.null", phase: "not.is.null" })
if (kickoffNull.length === 0) {
  console.log("✅ 0 fixtures con phase definido pero kickoff IS NULL")
} else {
  problems++
  console.log(`❌ ${kickoffNull.length} fixtures con phase definido pero kickoff NULL:`)
  for (const f of kickoffNull) console.log(`   id=${f.id} bracket_position=${f.bracket_position} home=${f.home_team_name}`)
}

// 3. Knockout fixture with a real (non-synthetic) id — should never happen;
//    all knockout rows must live at id >= 9,000,000 (lib/bracket-slots.ts).
const rawKnockout = await get("fixtures", { select: "id,bracket_position,phase,home_team_name,away_team_name", bracket_position: "not.is.null", id: "lt.9000000" })
if (rawKnockout.length === 0) {
  console.log("✅ 0 fixtures de eliminatoria con ID crudo de API-Football (todas usan slot sintético)")
} else {
  problems++
  console.log(`❌ ${rawKnockout.length} fixtures de eliminatoria con ID < 9,000,000 (deberían usar slot sintético):`)
  for (const f of rawKnockout) console.log(`   id=${f.id} bracket_position=${f.bracket_position} ${f.home_team_name} vs ${f.away_team_name}`)
}

console.log("\n═══════════════════════════════════════════════════════")
console.log(problems === 0 ? "✅ Sin filas fantasma detectadas" : `❌ ${problems} tipo(s) de problema detectado(s) — revisar arriba`)
console.log("═══════════════════════════════════════════════════════\n")

if (problems > 0) process.exit(1)
