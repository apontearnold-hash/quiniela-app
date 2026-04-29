/**
 * API-Football discovery script — research only, no DB writes, no production changes.
 *
 * Run from project root:
 *   node scripts/discover-api-football.mjs
 *
 * Reads FOOTBALL_API_KEY (or API_FOOTBALL_KEY) from .env.local automatically.
 */

import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

// ── Load .env.local manually (no dotenv dependency) ──────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dir, "..", ".env.local")

let API_KEY = null
try {
  const lines = readFileSync(envPath, "utf8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const [k, ...rest] = trimmed.split("=")
    const key = k.trim()
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "")
    if (key === "FOOTBALL_API_KEY" || key === "API_FOOTBALL_KEY") {
      API_KEY = val
      break
    }
  }
} catch {
  console.error("❌  No se pudo leer .env.local")
  process.exit(1)
}

if (!API_KEY) {
  console.error("❌  No se encontró FOOTBALL_API_KEY ni API_FOOTBALL_KEY en .env.local")
  process.exit(1)
}

const BASE = "https://v3.football.api-sports.io"

async function api(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "x-apisports-key": API_KEY },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${path}`)
  const json = await res.json()
  if (json.errors && Object.keys(json.errors).length > 0) {
    const msg = Object.values(json.errors).join(", ")
    throw new Error(`API error on ${path}: ${msg}`)
  }
  return json.response ?? []
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cov(coverage) {
  if (!coverage) return "(sin datos)"
  const flags = []
  if (coverage.standings)   flags.push("standings")
  if (coverage.players)     flags.push("players")
  if (coverage.top_scorers) flags.push("top_scorers")
  if (coverage.predictions) flags.push("predictions")
  if (coverage.injuries)    flags.push("injuries")
  if (coverage.statistics?.fixtures) flags.push("stats_fixtures")
  return flags.length ? flags.join(", ") : "básico"
}

function printLeagues(title, leagues) {
  console.log(`\n${"─".repeat(70)}`)
  console.log(`  ${title}`)
  console.log("─".repeat(70))
  if (!leagues.length) { console.log("  (sin resultados)"); return }
  for (const item of leagues) {
    const { league, country, seasons } = item
    const latest = seasons?.slice(-1)[0]
    const coverage = latest?.coverage
    console.log(`  [${league.id}] ${league.name}`)
    console.log(`       País    : ${country?.name ?? "—"}`)
    console.log(`       Última  : ${latest?.year ?? "—"} (current=${latest?.current ?? false})`)
    console.log(`       Cobertura: ${cov(coverage)}`)
    if (coverage?.standings)   console.log(`         ✓ standings`)
    if (coverage?.players)     console.log(`         ✓ players / top_scorers`)
    if (coverage?.top_scorers) console.log(`         ✓ top_scorers`)
    if (coverage?.predictions) console.log(`         ✓ predictions`)
  }
}

// ── 1. League searches ────────────────────────────────────────────────────────

const SEARCHES = [
  "World Cup",
  "Qualification",
  "CONMEBOL",
  "UEFA",
  "CONCACAF",
  "Friendlies",
]

console.log("\n╔══════════════════════════════════════════════════════════════════════╗")
console.log("║          API-Football — Discovery Script (read-only)               ║")
console.log("╚══════════════════════════════════════════════════════════════════════╝")
console.log("\n⏳  Consultando ligas...")

const allLeagues = {}
for (const term of SEARCHES) {
  await sleep(300) // respect rate limit
  const results = await api(`/leagues?search=${encodeURIComponent(term)}`)
  allLeagues[term] = results
  process.stdout.write(` ✓ "${term}" → ${results.length} resultados\n`)
}

for (const [term, leagues] of Object.entries(allLeagues)) {
  printLeagues(`Búsqueda: "${term}"`, leagues)
}

// ── 2. Deep-dive on high-value leagues ───────────────────────────────────────
//
// We focus on leagues that are:
//   - Directly related to WC 2026 (qualification, confederations)
//   - Have standings or top_scorers coverage
//   - Season 2024 or 2025/2026 (most recent data available)

// After league search we'll identify IDs for:
//   - WC 2026 Qualification: CONMEBOL (9), UEFA (960), CONCACAF (30?), etc.
//   - International Friendlies (1260?)
//   - CONMEBOL Copa America (9?)
//   - UEFA Nations League (~5)

// Known IDs to probe directly (common in v3):
const PROBE = [
  { id: 1,    name: "FIFA World Cup",            season: 2026 },
  { id: 9,    name: "Copa America",               season: 2024 },
  { id: 10,   name: "UEFA Nations League",        season: 2024 },
  { id: 29,   name: "AFC Asian Cup",              season: 2023 },
  { id: 30,   name: "CONCACAF Gold Cup",          season: 2023 },
  { id: 34,   name: "Africa Cup of Nations",      season: 2023 },
  { id: 32,   name: "OFC Nations Cup",            season: 2024 },
  { id: 31,   name: "Copa America",               season: 2021 },  // fallback
  { id: 960,  name: "WC Qual. UEFA",              season: 2026 },
  { id: 29,   name: "WC Qual. AFC",               season: 2026 },
  { id: 30,   name: "WC Qual. CONCACAF",          season: 2026 },
  { id: 33,   name: "WC Qual. CONMEBOL",          season: 2026 },
  { id: 34,   name: "WC Qual. CAF",               season: 2026 },
  { id: 1260, name: "Friendlies International",   season: 2025 },
]

// Deduplicate by id+season
const uniqueProbe = []
const seen = new Set()
for (const p of PROBE) {
  const k = `${p.id}-${p.season}`
  if (!seen.has(k)) { seen.add(k); uniqueProbe.push(p) }
}

console.log("\n\n╔══════════════════════════════════════════════════════════════════════╗")
console.log("║               Deep-dive: fixtures & standings                      ║")
console.log("╚══════════════════════════════════════════════════════════════════════╝")

const summaryRows = []

for (const { id, name, season } of uniqueProbe) {
  await sleep(400)
  console.log(`\n─── [${id}] ${name} (${season}) ${"─".repeat(30 - name.length > 0 ? 30 - name.length : 0)}`)

  // League info
  let leagueInfo = null
  try {
    const lData = await api(`/leagues?id=${id}`)
    leagueInfo = lData[0]
    if (!leagueInfo) { console.log("  ⚠  Liga no encontrada"); continue }
    const s = leagueInfo.seasons?.find(s => s.year === season) ?? leagueInfo.seasons?.slice(-1)[0]
    if (s) {
      console.log(`  Nombre  : ${leagueInfo.league.name} — ${leagueInfo.country?.name}`)
      console.log(`  Temporada: ${s.year} | current=${s.current}`)
      console.log(`  Cobertura: ${cov(s.coverage)}`)
    }
  } catch (e) {
    console.log(`  ⚠  Error al buscar liga: ${e.message}`)
    continue
  }

  await sleep(300)

  // Last 5 fixtures
  try {
    const fx = await api(`/fixtures?league=${id}&season=${season}&last=5`)
    if (fx.length) {
      console.log(`  Últimos partidos (${fx.length}):`)
      for (const f of fx.slice(0, 3)) {
        const home = f.teams?.home?.name ?? "?"
        const away = f.teams?.away?.name ?? "?"
        const gh   = f.goals?.home ?? "-"
        const ga   = f.goals?.away ?? "-"
        const date = f.fixture?.date?.slice(0, 10) ?? "?"
        console.log(`    ${date}  ${home} ${gh}–${ga} ${away}  [${f.fixture?.status?.short}]`)
      }
    } else {
      console.log("  Partidos : (sin datos para esta temporada)")
    }
  } catch (e) {
    console.log(`  Partidos : ⚠ ${e.message}`)
  }

  await sleep(300)

  // Standings
  const s = leagueInfo.seasons?.find(s => s.year === season) ?? leagueInfo.seasons?.slice(-1)[0]
  let hasStandings = false
  let hasTopScorers = false
  let fixtureCount = 0

  if (s?.coverage?.standings) {
    hasStandings = true
    try {
      const st = await api(`/standings?league=${id}&season=${season}`)
      if (st.length) {
        const groups = st[0]?.league?.standings ?? []
        console.log(`  Standings: ${groups.length} grupo(s)/tabla(s)`)
        const firstGroup = groups[0]
        if (firstGroup?.length) {
          const top3 = firstGroup.slice(0, 3)
          for (const t of top3) {
            console.log(`    ${t.rank}. ${t.team?.name ?? "?"} — ${t.points} pts`)
          }
        }
      } else {
        console.log("  Standings: (sin datos)")
      }
    } catch (e) {
      console.log(`  Standings: ⚠ ${e.message}`)
    }
    await sleep(300)
  }

  // Top scorers
  if (s?.coverage?.top_scorers) {
    hasTopScorers = true
    try {
      const ts = await api(`/players/topscorers?league=${id}&season=${season}`)
      if (ts.length) {
        console.log(`  Top scorers (${ts.length} jugadores):`)
        for (const p of ts.slice(0, 3)) {
          const pName    = p.player?.name ?? "?"
          const team     = p.statistics?.[0]?.team?.name ?? "?"
          const goals    = p.statistics?.[0]?.goals?.total ?? 0
          console.log(`    ${goals} goles — ${pName} (${team})`)
        }
      } else {
        console.log("  Top scorers: (sin datos)")
      }
    } catch (e) {
      console.log(`  Top scorers: ⚠ ${e.message}`)
    }
    await sleep(300)
  }

  // Count total fixtures for this league/season
  try {
    const allFx = await api(`/fixtures?league=${id}&season=${season}`)
    fixtureCount = allFx.length
    console.log(`  Total partidos en BD: ${fixtureCount}`)
  } catch {
    // ignore
  }

  summaryRows.push({
    id,
    name: leagueInfo.league.name,
    country: leagueInfo.country?.name ?? "International",
    season,
    fixtures: fixtureCount,
    standings: hasStandings,
    topScorers: hasTopScorers,
  })
}

// ── 3. Summary table ──────────────────────────────────────────────────────────

console.log("\n\n╔══════════════════════════════════════════════════════════════════════╗")
console.log("║                     TABLA RESUMEN                                  ║")
console.log("╚══════════════════════════════════════════════════════════════════════╝")
console.log("\n  ID    Liga                              País          Temp  Partidos  Stand  TopScorer")
console.log("  " + "─".repeat(88))

for (const r of summaryRows) {
  const id       = String(r.id).padEnd(5)
  const name     = r.name.substring(0, 34).padEnd(35)
  const country  = (r.country ?? "").substring(0, 13).padEnd(14)
  const season   = String(r.season).padEnd(5)
  const fixtures = String(r.fixtures).padEnd(9)
  const standings = r.standings  ? "  ✓    " : "  —    "
  const topScorer = r.topScorers ? "  ✓" : "  —"
  console.log(`  ${id} ${name} ${country} ${season} ${fixtures}${standings}${topScorer}`)
}

console.log("\n  ✓ = disponible   — = no disponible en esta temporada")
console.log("\n  💡 Recomendaciones para la app:")
console.log("     • Clasificatorias con más partidos y standings → candidatas a quiniela de calificación")
console.log("     • top_scorers disponible → se puede mostrar tabla de goleadores por competición")
console.log("     • Liga con current=true y fixtures > 0 → datos en vivo disponibles")
console.log("")
