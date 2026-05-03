/**
 * Diagnose fixture phases in DB — read-only, no writes.
 * Run: node scripts/check-phases.mjs
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
    if (trimmed.startsWith("#") || !trimmed.includes("=")) continue
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
  console.error("❌  Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

async function query(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ sql }),
  })
  if (!res.ok) {
    // Fallback: use direct table select via REST
    return null
  }
  return res.json()
}

// Use Supabase PostgREST to query fixtures table
async function selectFixtures(params) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/fixtures`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), {
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Accept": "application/json",
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }
  return res.json()
}

console.log("\n═══════════════════════════════════════════════════════")
console.log("  Diagnóstico de phases en fixtures DB")
console.log("═══════════════════════════════════════════════════════\n")

// 1. All distinct round+phase combos
console.log("── Todas las combinaciones round → phase en DB ─────────\n")
const allFixtures = await selectFixtures({
  select: "round,phase,group_name",
  order:  "phase.asc,round.asc",
  limit:  "200",
})

const combos = new Map()
for (const f of allFixtures) {
  const key = `${f.phase ?? "NULL"}|||${f.round}`
  if (!combos.has(key)) combos.set(key, { phase: f.phase, round: f.round, count: 0 })
  combos.get(key).count++
}

for (const { phase, round, count } of [...combos.values()].sort((a,b) => (a.phase??'').localeCompare(b.phase??''))) {
  const flag = (phase === 'groups' && round && !round.toLowerCase().includes('group')) ? " ⚠ POSIBLE ERROR" : ""
  console.log(`  phase=${String(phase).padEnd(16)}  round="${round}"  (${count} fixtures)${flag}`)
}

// 2. Show specifically fixtures where phase = 'groups' but round doesn't contain 'group'
console.log("\n── Fixtures con phase='groups' pero round no es de grupos ─\n")
const suspectFixtures = allFixtures.filter(f =>
  f.phase === 'groups' && f.round && !f.round.toLowerCase().includes('group')
)

if (suspectFixtures.length === 0) {
  console.log("  ✓ Ninguno — todos los fixtures de grupos tienen round correcto")
} else {
  console.log(`  ⚠ ${suspectFixtures.length} fixtures sospechosos:`)
  const suspectCombos = new Map()
  for (const f of suspectFixtures) {
    if (!suspectCombos.has(f.round)) suspectCombos.set(f.round, 0)
    suspectCombos.set(f.round, suspectCombos.get(f.round) + 1)
  }
  for (const [round, count] of suspectCombos) {
    console.log(`    round="${round}"  (${count} fixtures)`)
  }
}

// 3. Count by phase
console.log("\n── Conteo de fixtures por phase ────────────────────────\n")
const phaseCounts = new Map()
for (const f of allFixtures) {
  const p = f.phase ?? "NULL"
  phaseCounts.set(p, (phaseCounts.get(p) ?? 0) + 1)
}
for (const [phase, count] of [...phaseCounts.entries()].sort()) {
  console.log(`  ${String(phase).padEnd(20)} ${count} fixtures`)
}

console.log("\n═══════════════════════════════════════════════════════\n")
