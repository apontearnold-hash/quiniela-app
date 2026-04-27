import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import { recalculateGroupStandings } from "@/lib/bracket"
import { recalculateAllPoints } from "@/lib/recalculate"
import { BRACKET_SLOTS } from "@/lib/bracket-slots"
import { determineKnockoutWinner } from "@/lib/bracket-projection"
import type { Phase } from "@/lib/types"

// ── Auth ──────────────────────────────────────────────────────────────────────

async function requireAdmin(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) return null
  return user
}

// ── Score generators ──────────────────────────────────────────────────────────

function randGoals(): number {
  const r = Math.random()
  if (r < 0.14) return 0
  if (r < 0.40) return 1
  if (r < 0.67) return 2
  if (r < 0.84) return 3
  if (r < 0.94) return 4
  return 5
}

function randGroupScore() {
  return { home: randGoals(), away: randGoals() }
}

function randKnockoutScore(): { home: number; away: number; went_to_penalties: boolean; penalties_winner: string | null } {
  let home = randGoals()
  let away = randGoals()
  let went_to_penalties = false
  let penalties_winner: string | null = null

  if (home === away) {
    const rnd = Math.random()
    if (rnd < 0.35) {
      if (Math.random() < 0.5) home++; else away++
    } else if (rnd < 0.65) {
      went_to_penalties = true
      penalties_winner = Math.random() < 0.5 ? "home" : "away"
    } else {
      if (Math.random() < 0.5) home++; else away++
    }
  }
  return { home, away, went_to_penalties, penalties_winner }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TeamRow = {
  team_id: number
  team_name: string
  team_code: string | null
  team_flag: string | null
  points: number
  goal_difference: number
  goals_for: number
  goals_against: number
  played: number; won: number; drawn: number; lost: number
}

type TeamInfo = { id: number; name: string; code: string | null; flag: string | null }

interface SimulatedKnockoutResult {
  slot_key: string
  phase: Phase
  kickoff: string
  home_placeholder: string
  away_placeholder: string
  home: TeamInfo
  away: TeamInfo
  home_score: number
  away_score: number
  went_to_penalties: boolean
  penalties_winner: string | null
}

// ── Simulate group phase (write directly to DB) ───────────────────────────────

async function simulateGroups(
  admin: ReturnType<typeof createAdminClient>
): Promise<number> {
  const { data: fixtures, error } = await admin
    .from("fixtures")
    .select("id, home_team_id, away_team_id, result_source")
    .eq("phase", "groups")
    .or("result_source.is.null,result_source.eq.simulation")

  if (error) throw new Error(`Fetch group fixtures: ${error.message}`)

  let simulated = 0
  for (const f of fixtures ?? []) {
    if (!f.home_team_id || !f.away_team_id) continue
    const { home, away } = randGroupScore()
    const { error: uErr } = await admin
      .from("fixtures")
      .update({
        home_score: home,
        away_score: away,
        went_to_penalties: false,
        penalties_winner: null,
        status: "finished",
        result_source: "simulation",
        updated_at: new Date().toISOString(),
      })
      .eq("id", f.id)
    if (uErr) throw new Error(`Simulate group fixture ${f.id}: ${uErr.message}`)
    simulated++
  }
  return simulated
}

// ── Full tournament simulation (in-memory, bracket-slot based) ───────────────
//
// Uses the same BRACKET_SLOTS + resolution logic as the quiniela creation flow.
// This is independent from whether DB has knockout fixtures pre-loaded.

function sortByPoints(teams: TeamRow[]): TeamRow[] {
  return [...teams].sort(
    (a, b) =>
      b.points - a.points ||
      b.goal_difference - a.goal_difference ||
      b.goals_for - a.goals_for ||
      a.team_name.localeCompare(b.team_name)
  )
}

function simulateTournamentKnockout(
  standings: Record<string, Record<number, TeamRow>>
): SimulatedKnockoutResult[] {
  // Build sorted group maps (letter → sorted teams)
  const groups: Record<string, TeamRow[]> = {}
  for (const [groupName, teams] of Object.entries(standings)) {
    groups[groupName] = sortByPoints(Object.values(teams))
  }

  // Best 8 third-place teams (for "Mejor 3ro" slots)
  const thirds: Array<TeamRow & { groupLetter: string }> = []
  for (const [groupName, sorted] of Object.entries(groups)) {
    const m = groupName.match(/\b([A-L])\b/i)
    if (m && sorted[2]) thirds.push({ ...sorted[2], groupLetter: m[1].toUpperCase() })
  }
  const best8 = sortByPoints(thirds).slice(0, 8) as Array<TeamRow & { groupLetter: string }>
  const assignedThirds = new Set<number>()

  const winnerByPos = new Map<string, TeamInfo>()
  const loserByPos  = new Map<string, TeamInfo>()
  const results: SimulatedKnockoutResult[] = []

  function teamInfo(t: TeamRow): TeamInfo {
    return { id: t.team_id, name: t.team_name, code: t.team_code, flag: t.team_flag }
  }

  function groupLetter(name: string): string {
    const m = name.match(/\b([A-L])\b/i)
    return m ? m[1].toUpperCase() : ""
  }

  function resolveTeam(placeholder: string): TeamInfo | null {
    // "1ro/2do Grupo X" — use group standings
    const gm = placeholder.match(/^([12])(?:ro|do)\s+Grupo\s+([A-L])$/i)
    if (gm) {
      const idx = parseInt(gm[1]) - 1
      const g = `Grupo ${gm[2].toUpperCase()}`
      const team = groups[g]?.[idx]
      return team ? teamInfo(team) : null
    }

    // "Mejor 3ro (A/B/C/D/F)" — same greedy pool-aware assignment as bracket-projection.ts
    if (placeholder.startsWith("Mejor 3ro")) {
      const poolMatch = placeholder.match(/\(([A-L/]+)\)/)
      const pool = poolMatch ? poolMatch[1].split("/") : null

      // 1st pass: best unassigned team whose group is in the pool
      let chosen = best8.find(
        t => !assignedThirds.has(t.team_id) && (!pool || pool.includes(t.groupLetter))
      )
      // 2nd pass: any unassigned team (fallback)
      if (!chosen) chosen = best8.find(t => !assignedThirds.has(t.team_id))
      if (!chosen) return null
      assignedThirds.add(chosen.team_id)
      return teamInfo(chosen)
    }

    // "Ganador R32-01" / "Ganador QF-02" etc.
    const wm = placeholder.match(/^Ganador\s+((?:R32|R16|QF|SF)-\d+)$/i)
    if (wm) return winnerByPos.get(wm[1]) ?? null

    // "Perdedor SF-01" (third-place match)
    const lm = placeholder.match(/^Perdedor\s+(SF-\d+)$/i)
    if (lm) return loserByPos.get(lm[1]) ?? null

    return null
  }

  // Iterate BRACKET_SLOTS in order (R32 → R16 → QF → SF → 3P → FIN)
  // The array is already in correct sequential order — same as resolveKnockoutBracket.
  for (const slot of BRACKET_SLOTS) {
    const home = resolveTeam(slot.home_placeholder)
    const away = resolveTeam(slot.away_placeholder)

    if (!home || !away) continue // bracket not ready for this slot

    const { home: hScore, away: aScore, went_to_penalties, penalties_winner } = randKnockoutScore()

    const winner = determineKnockoutWinner(hScore, aScore, went_to_penalties, penalties_winner)
    if (winner === "home") {
      winnerByPos.set(slot.slot_key, home)
      loserByPos.set(slot.slot_key, away)
    } else if (winner === "away") {
      winnerByPos.set(slot.slot_key, away)
      loserByPos.set(slot.slot_key, home)
    }

    results.push({
      slot_key: slot.slot_key,
      phase: slot.phase,
      kickoff: slot.kickoff,
      home_placeholder: slot.home_placeholder,
      away_placeholder: slot.away_placeholder,
      home,
      away,
      home_score: hScore,
      away_score: aScore,
      went_to_penalties,
      penalties_winner,
    })
  }

  return results
}

// ── Persist knockout results to DB ────────────────────────────────────────────
//
// Preferred order for choosing fixture ID to upsert into:
//   1. Existing DB fixture with matching bracket_position (e.g. id=1000073)
//   2. BRACKET_SLOT synthetic ID (e.g. id=9_000_001) — created on first run
//
// This lets scoring work via: bracket_picks.slot_key = fixtures.bracket_position

const SLOT_ID_BASE = 9_000_000

async function persistKnockoutSimulation(
  admin: ReturnType<typeof createAdminClient>,
  results: SimulatedKnockoutResult[]
): Promise<void> {
  // Fetch all fixtures that already have bracket_position set (includes 1000073+ rows)
  const { data: existing, error } = await admin
    .from("fixtures")
    .select("id, bracket_position, result_source")
    .not("bracket_position", "is", null)
  if (error) throw new Error(`Fetch bracket fixtures: ${error.message}`)

  const posToExisting = new Map<string, { id: number; result_source: string | null }>()
  for (const f of existing ?? []) {
    if (f.bracket_position) posToExisting.set(f.bracket_position, { id: f.id, result_source: f.result_source })
  }

  for (const r of results) {
    const existingRow = posToExisting.get(r.slot_key)

    // Never overwrite official API results
    if (existingRow?.result_source === "api") continue

    if (existingRow) {
      // Fixture already exists — update score fields only, never touch team identity data
      const { error: uErr } = await admin
        .from("fixtures")
        .update({
          home_score: r.home_score,
          away_score: r.away_score,
          went_to_penalties: r.went_to_penalties,
          penalties_winner: r.penalties_winner,
          penalty_home: r.went_to_penalties ? (r.penalties_winner === "home" ? 1 : 0) : null,
          penalty_away: r.went_to_penalties ? (r.penalties_winner === "away" ? 1 : 0) : null,
          status: "finished",
          status_short: "FT",
          status_long: "Full Time",
          elapsed: 90,
          // Set teams only if the row has none (placeholder rows from supabase-update.sql start with null teams)
          home_team_id: r.home.id,
          home_team_name: r.home.name,
          home_team_code: r.home.code,
          home_team_flag: r.home.flag,
          away_team_id: r.away.id,
          away_team_name: r.away.name,
          away_team_code: r.away.code,
          away_team_flag: r.away.flag,
          result_source: "simulation",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingRow.id)
      if (uErr) throw new Error(`Update ${r.slot_key} (id=${existingRow.id}): ${uErr.message}`)
    } else {
      // No fixture exists with this bracket_position — create one using the BRACKET_SLOT ID
      const slotIndex = BRACKET_SLOTS.findIndex(s => s.slot_key === r.slot_key)
      const newId = SLOT_ID_BASE + slotIndex + 1

      const { error: uErr } = await admin
        .from("fixtures")
        .upsert(
          {
            id: newId,
            league_id: 1,
            season: 2026,
            round: r.slot_key,
            phase: r.phase,
            group_name: null,
            kickoff: r.kickoff,
            bracket_position: r.slot_key,
            home_placeholder: r.home_placeholder,
            away_placeholder: r.away_placeholder,
            status: "finished",
            status_short: "FT",
            status_long: "Full Time",
            elapsed: 90,
            home_team_id: r.home.id,
            home_team_name: r.home.name,
            home_team_code: r.home.code,
            home_team_flag: r.home.flag,
            away_team_id: r.away.id,
            away_team_name: r.away.name,
            away_team_code: r.away.code,
            away_team_flag: r.away.flag,
            home_score: r.home_score,
            away_score: r.away_score,
            went_to_penalties: r.went_to_penalties,
            penalties_winner: r.penalties_winner,
            penalty_home: r.went_to_penalties ? (r.penalties_winner === "home" ? 1 : 0) : null,
            penalty_away: r.went_to_penalties ? (r.penalties_winner === "away" ? 1 : 0) : null,
            result_source: "simulation",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
      if (uErr) throw new Error(`Insert ${r.slot_key}: ${uErr.message}`)
    }
  }
}

// ── POST: simulate full tournament ────────────────────────────────────────────

export async function POST(request: Request) {
  const user = await requireAdmin(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const phase = (body.phase ?? "all") as string

  const admin = createAdminClient()

  // ── Individual phase: simulate only that phase's DB fixtures ──────────────
  if (phase !== "all") {
    const validPhases: Phase[] = ["groups", "round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"]
    if (!validPhases.includes(phase as Phase)) {
      return NextResponse.json({ error: `Fase inválida: ${phase}` }, { status: 400 })
    }
    try {
      const phaseFilter = phase === "final" ? ["final", "semifinals"] : [phase]
      const { data: fixtures, error } = await admin
        .from("fixtures")
        .select("id, phase, home_team_id, away_team_id, result_source")
        .in("phase", phaseFilter)
        .or("result_source.is.null,result_source.eq.simulation")

      if (error) throw new Error(`Fetch ${phase} fixtures: ${error.message}`)

      let simulated = 0, skipped = 0
      for (const f of fixtures ?? []) {
        if (!f.home_team_id || !f.away_team_id) { skipped++; continue }
        const isGroups = f.phase === "groups"
        const score = isGroups ? randGroupScore() : (() => {
          const s = randKnockoutScore()
          return { home: s.home, away: s.away, went_to_penalties: s.went_to_penalties, penalties_winner: s.penalties_winner }
        })()
        await admin.from("fixtures").update({
          home_score: score.home,
          away_score: score.away,
          went_to_penalties: "went_to_penalties" in score ? score.went_to_penalties : false,
          penalties_winner: "penalties_winner" in score ? score.penalties_winner : null,
          status: "finished",
          result_source: "simulation",
          updated_at: new Date().toISOString(),
        }).eq("id", f.id)
        simulated++
      }

      const msg = skipped > 0
        ? `${phase}: ${simulated} simulado(s), ${skipped} sin equipos`
        : `${phase}: ${simulated} simulado(s)`

      if (simulated > 0) await recalculateAllPoints(admin)
      return NextResponse.json({ message: msg, total_simulated: simulated })
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  }

  // ── Full tournament simulation (phase = "all") ────────────────────────────
  try {
    // Step 1: Simulate all group games in DB
    const groupsSimulated = await simulateGroups(admin)

    // Step 2: Inspect what the DB actually has after simulation (diagnostic)
    const { data: groupFixtures, error: diagErr } = await admin
      .from("fixtures")
      .select("id, phase, status, group_name, home_team_id, away_team_id, home_score, away_score, result_source")
      .eq("phase", "groups")
      .limit(200)

    const diag = {
      groupsSimulated,
      totalGroupFixturesInDB: groupFixtures?.length ?? 0,
      withGroupName: groupFixtures?.filter(f => !!f.group_name).length ?? 0,
      withScores: groupFixtures?.filter(f => f.home_score !== null && f.away_score !== null).length ?? 0,
      withStatusFinished: groupFixtures?.filter(f => f.status === "finished").length ?? 0,
      withBothTeams: groupFixtures?.filter(f => f.home_team_id && f.away_team_id).length ?? 0,
      resultSourceBreakdown: groupFixtures?.reduce((acc: Record<string, number>, f) => {
        const k = f.result_source ?? "null"
        acc[k] = (acc[k] ?? 0) + 1
        return acc
      }, {}) ?? {},
      sample3: groupFixtures?.slice(0, 3).map(f => ({
        id: f.id,
        phase: f.phase,
        status: f.status,
        group_name: f.group_name,
        home_team_id: f.home_team_id,
        away_team_id: f.away_team_id,
        home_score: f.home_score,
        away_score: f.away_score,
        result_source: f.result_source,
      })) ?? [],
      diagError: diagErr?.message ?? null,
    }

    console.log("[simulate] group fixture diagnostics:", JSON.stringify(diag, null, 2))

    // Step 3: Compute group standings from just-simulated results
    const standings = await recalculateGroupStandings(admin)

    if (Object.keys(standings).length === 0) {
      return NextResponse.json({
        error: "No group standings after simulating groups.",
        diagnostics: diag,
        hint: diag.withGroupName === 0
          ? "group_name is NULL on all group fixtures — run the group name inference (POST /api/admin/sync to re-import, or set group_name manually)"
          : diag.withStatusFinished === 0
          ? "No fixtures have status='finished' after simulation — check result_source column exists in DB"
          : diag.withScores === 0
          ? "No fixtures have scores after simulation — simulateGroups may have updated 0 rows"
          : "Unknown mismatch — see diagnostics",
      }, { status: 500 })
    }

    // Step 3: Run full bracket simulation in-memory using BRACKET_SLOTS
    // (same structure and team-resolution logic as the quiniela creation flow)
    const knockoutResults = simulateTournamentKnockout(standings)

    // Step 4: Persist knockout results to DB
    await persistKnockoutSimulation(admin, knockoutResults)

    // Step 5: Recalculate points for all quinielas
    const { predictions, quinielas } = await recalculateAllPoints(admin)

    // Step 6: Build diagnostic breakdown by phase
    const countByPhase: Record<string, number> = {}
    for (const r of knockoutResults) {
      countByPhase[r.phase] = (countByPhase[r.phase] ?? 0) + 1
    }
    // For "semifinals" phase, separate SF (2) from 3P (1)
    const sfCount = knockoutResults.filter(r => r.phase === "semifinals" && r.slot_key.startsWith("SF")).length
    const finalCount = knockoutResults.filter(r => r.phase === "final").length
    const thirdCount = knockoutResults.filter(r => r.slot_key === "3P").length

    const messages = [
      `groups: ${groupsSimulated} simulado(s)`,
      `round_of_32: ${countByPhase["round_of_32"] ?? 0} simulado(s)`,
      `round_of_16: ${countByPhase["round_of_16"] ?? 0} simulado(s)`,
      `quarterfinals: ${countByPhase["quarterfinals"] ?? 0} simulado(s)`,
      `semifinals: ${sfCount} simulado(s)`,
      `3er_lugar: ${thirdCount} simulado(s)`,
      `final: ${finalCount} simulado(s)`,
      `Puntos recalculados: ${predictions} predicciones · ${quinielas} quinielas`,
    ]

    return NextResponse.json({
      message: messages.join(" | "),
      total_simulated: groupsSimulated + knockoutResults.length,
      breakdown: {
        groups: groupsSimulated,
        round_of_32: countByPhase["round_of_32"] ?? 0,
        round_of_16: countByPhase["round_of_16"] ?? 0,
        quarterfinals: countByPhase["quarterfinals"] ?? 0,
        semifinals: sfCount,
        third_place: thirdCount,
        final: finalCount,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ── DELETE: clear all simulated results ──────────────────────────────────────
//
// Safety rules:
//   GROUP fixtures (bracket_position IS NULL): clear ONLY scores/status/result_source.
//     NEVER touch team_id, team_name, team_flag, group_name — those came from the API.
//   KNOCKOUT fixtures (bracket_position IS NOT NULL): also clear team assignments,
//     because simulation created/overwrote them (they weren't from the API).

export async function DELETE(request: Request) {
  const user = await requireAdmin(request)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()

  // Part A: group fixtures — clear scores only, leave all team/group data intact
  const { data: clearedGroups, error: errG } = await admin
    .from("fixtures")
    .update({
      home_score: null,
      away_score: null,
      went_to_penalties: false,
      penalties_winner: null,
      status: "not_started",
      result_source: null,
      updated_at: new Date().toISOString(),
    })
    .eq("result_source", "simulation")
    .is("bracket_position", null)
    .select("id")

  if (errG) return NextResponse.json({ error: `Clear groups: ${errG.message}` }, { status: 500 })

  // Part B: knockout fixtures — clear scores AND team assignments
  // (simulation set these; they were never official API data)
  const { data: clearedKnockout, error: errK } = await admin
    .from("fixtures")
    .update({
      home_score: null,
      away_score: null,
      went_to_penalties: false,
      penalties_winner: null,
      penalty_home: null,
      penalty_away: null,
      status: "not_started",
      status_short: "NS",
      status_long: "Not Started",
      elapsed: null,
      home_team_id: null,
      home_team_name: null,
      home_team_code: null,
      home_team_flag: null,
      away_team_id: null,
      away_team_name: null,
      away_team_code: null,
      away_team_flag: null,
      result_source: null,
      updated_at: new Date().toISOString(),
    })
    .eq("result_source", "simulation")
    .not("bracket_position", "is", null)
    .select("id")

  if (errK) return NextResponse.json({ error: `Clear knockout: ${errK.message}` }, { status: 500 })

  const groupCount    = clearedGroups?.length ?? 0
  const knockoutCount = clearedKnockout?.length ?? 0
  const total         = groupCount + knockoutCount

  if (total === 0) {
    return NextResponse.json({ message: "No hay resultados simulados para borrar.", cleared: 0 })
  }

  // Clear group standings — they were built from simulated scores and are now stale.
  // Group team data in the fixtures table is untouched (protected above).
  await admin.from("groups").delete().not("group_name", "is", null)

  let pipelineError: string | null = null
  try {
    await recalculateAllPoints(admin)
  } catch (e) {
    pipelineError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    message: `Simulación borrada: ${groupCount} grupos (scores borrados, equipos intactos) + ${knockoutCount} eliminatorias borradas. Puntos recalculados.`,
    cleared: total,
    pipelineError,
  })
}
