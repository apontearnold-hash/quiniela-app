/**
 * Bracket advancement logic for the 2026 World Cup.
 *
 * Flow:
 *  1. recalculateGroupStandings() — updates public.groups from finished group fixtures
 *  2. fillGroupAdvancers()         — sets home/away team data on R32 fixtures where
 *                                    placeholder = "1ro Grupo X" / "2do Grupo X"
 *  3. assignBest3rd()              — once all 12 groups are done, fills the 8
 *                                    "Mejor 3ro" R32 slots with the top-8 3rd-place teams
 *  4. advanceKnockout()            — for every finished knockout fixture, writes the
 *                                    winner (or loser for the 3P game) into the next slot
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { determineKnockoutWinner } from "./bracket-projection"

// -------------------------------------------------------------------
// Types
// -------------------------------------------------------------------

interface TeamRow {
  team_id: number
  team_name: string
  team_flag: string | null
  team_code: string | null
  points: number
  goal_difference: number
  goals_for: number
  goals_against: number
  played: number
  won: number
  drawn: number
  lost: number
}

interface FixtureRow {
  id: number
  phase: string
  status: string
  home_team_id: number | null
  home_team_name: string | null
  home_team_code: string | null
  home_team_flag: string | null
  away_team_id: number | null
  away_team_name: string | null
  away_team_code: string | null
  away_team_flag: string | null
  home_score: number | null
  away_score: number | null
  went_to_penalties: boolean
  penalties_winner: string | null
  group_name: string | null
  bracket_position: string | null
  home_placeholder: string | null
  away_placeholder: string | null
}

// -------------------------------------------------------------------
// 1. Group standings
// -------------------------------------------------------------------

export async function recalculateGroupStandings(supabase: SupabaseClient) {
  // Fetch all finished group stage fixtures
  const { data: fixtures, error: fErr } = await supabase
    .from("fixtures")
    .select("*")
    .eq("phase", "groups")
    .eq("status", "finished")

  if (fErr) throw new Error(`Fetch group fixtures: ${fErr.message}`)

  const rows = fixtures as FixtureRow[]

  // Build a standings map: groupName → teamId → TeamRow
  const standings: Record<string, Record<number, TeamRow>> = {}

  for (const f of rows) {
    if (f.home_score === null || f.away_score === null) continue
    if (!f.group_name) continue

    const g = f.group_name
    if (!standings[g]) standings[g] = {}

    const initTeam = (id: number, name: string, flag: string | null, code: string | null): TeamRow => ({
      team_id: id, team_name: name, team_flag: flag, team_code: code,
      points: 0, goal_difference: 0, goals_for: 0, goals_against: 0,
      played: 0, won: 0, drawn: 0, lost: 0,
    })

    if (!standings[g][f.home_team_id!]) standings[g][f.home_team_id!] = initTeam(f.home_team_id!, f.home_team_name!, f.home_team_flag, f.home_team_code)
    if (!standings[g][f.away_team_id!]) standings[g][f.away_team_id!] = initTeam(f.away_team_id!, f.away_team_name!, f.away_team_flag, f.away_team_code)

    const home = standings[g][f.home_team_id!]
    const away = standings[g][f.away_team_id!]

    home.played++; away.played++
    home.goals_for += f.home_score; home.goals_against += f.away_score
    away.goals_for += f.away_score; away.goals_against += f.home_score
    home.goal_difference = home.goals_for - home.goals_against
    away.goal_difference = away.goals_for - away.goals_against

    if (f.home_score > f.away_score) {
      home.won++; home.points += 3; away.lost++
    } else if (f.home_score < f.away_score) {
      away.won++; away.points += 3; home.lost++
    } else {
      home.drawn++; home.points++; away.drawn++; away.points++
    }
  }

  // Upsert into groups table
  const upsertRows = Object.entries(standings).flatMap(([groupName, teams]) =>
    Object.values(teams).map(t => ({
      group_name: groupName,
      team_id: t.team_id,
      team_name: t.team_name,
      team_flag: t.team_flag,
      team_code: t.team_code,
      played: t.played,
      won: t.won,
      drawn: t.drawn,
      lost: t.lost,
      goals_for: t.goals_for,
      goals_against: t.goals_against,
      goal_difference: t.goal_difference,
      points: t.points,
      updated_at: new Date().toISOString(),
    }))
  )

  if (upsertRows.length > 0) {
    const { error: uErr } = await supabase
      .from("groups")
      .upsert(upsertRows, { onConflict: "group_name,team_id" })
    if (uErr) throw new Error(`Upsert groups: ${uErr.message}`)
  }

  return standings
}

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function sortStandings(teams: TeamRow[]): TeamRow[] {
  return [...teams].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference
    if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for
    return 0
  })
}

// -------------------------------------------------------------------
// 2. Fill R32 slots from group 1st/2nd place
// -------------------------------------------------------------------

export async function fillGroupAdvancers(
  supabase: SupabaseClient,
  standings: Record<string, Record<number, TeamRow>>
) {
  let updated = 0

  // Fetch R32 fixtures that still have placeholders (no team assigned yet)
  const { data: r32Fixtures, error } = await supabase
    .from("fixtures")
    .select("*")
    .eq("phase", "round_of_32")

  if (error) throw new Error(`Fetch R32 fixtures: ${error.message}`)

  const fixtures = r32Fixtures as FixtureRow[]

  for (const fixture of fixtures) {
    const updates: Partial<FixtureRow> = {}
    let changed = false

    const tryFillSlot = (placeholder: string | null, side: "home" | "away") => {
      if (!placeholder) return
      const match = placeholder.match(/^([12])(?:ro|do)\s+Grupo\s+([A-L])$/i)
      if (!match) return
      const pos = parseInt(match[1]) - 1 // 0 = 1st, 1 = 2nd
      const groupName = `Grupo ${match[2].toUpperCase()}`
      const groupTeams = standings[groupName]
      if (!groupTeams) return
      const sorted = sortStandings(Object.values(groupTeams))
      const team = sorted[pos]
      if (!team) return

      if (side === "home") {
        updates.home_team_id = team.team_id
        updates.home_team_name = team.team_name
        updates.home_team_code = team.team_code
        updates.home_team_flag = team.team_flag
      } else {
        updates.away_team_id = team.team_id
        updates.away_team_name = team.team_name
        updates.away_team_code = team.team_code
        updates.away_team_flag = team.team_flag
      }
      changed = true
    }

    if (!fixture.home_team_id) tryFillSlot(fixture.home_placeholder, "home")
    if (!fixture.away_team_id) tryFillSlot(fixture.away_placeholder, "away")

    if (changed) {
      const { error: uErr } = await supabase
        .from("fixtures")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", fixture.id)
      if (uErr) throw new Error(`Update R32 fixture ${fixture.id}: ${uErr.message}`)
      updated++
    }
  }

  return updated
}

// -------------------------------------------------------------------
// 3. Assign best 3rd-place teams to "Mejor 3ro" slots
// -------------------------------------------------------------------

export async function assignBest3rd(
  supabase: SupabaseClient,
  standings: Record<string, Record<number, TeamRow>>
) {
  const ALL_GROUPS = ["A","B","C","D","E","F","G","H","I","J","K","L"]

  // Check if all 12 groups are complete (each has 6 finished games)
  const { data: finishedGroupGames, error: fErr } = await supabase
    .from("fixtures")
    .select("group_name")
    .eq("phase", "groups")
    .eq("status", "finished")

  if (fErr) throw new Error(`Count group games: ${fErr.message}`)

  const countByGroup: Record<string, number> = {}
  for (const row of (finishedGroupGames as { group_name: string | null }[])) {
    if (row.group_name) countByGroup[row.group_name] = (countByGroup[row.group_name] ?? 0) + 1
  }

  const completedGroups = ALL_GROUPS.filter(g => (countByGroup[`Grupo ${g}`] ?? 0) >= 6)
  if (completedGroups.length < 12) return 0 // Not all groups done yet

  // Collect 3rd-place team from each group
  const thirdPlaceTeams: Array<TeamRow & { group: string }> = []
  for (const g of ALL_GROUPS) {
    const groupName = `Grupo ${g}`
    const groupTeams = standings[groupName]
    if (!groupTeams) continue
    const sorted = sortStandings(Object.values(groupTeams))
    if (sorted.length >= 3) {
      thirdPlaceTeams.push({ ...sorted[2], group: g })
    }
  }

  // Sort to get the 8 best
  const ranked = thirdPlaceTeams.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goal_difference !== a.goal_difference) return b.goal_difference - a.goal_difference
    if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for
    return 0
  })

  const best8 = ranked.slice(0, 8)

  // Fetch R32 "Mejor 3ro" fixtures
  const { data: r32Fixtures, error: r32Err } = await supabase
    .from("fixtures")
    .select("*")
    .eq("phase", "round_of_32")
    .ilike("away_placeholder", "Mejor 3ro%")

  if (r32Err) throw new Error(`Fetch Mejor 3ro fixtures: ${r32Err.message}`)

  const slots = r32Fixtures as FixtureRow[]
  let updated = 0
  let teamIdx = 0

  for (const slot of slots) {
    if (slot.away_team_id) continue // Already filled
    if (teamIdx >= best8.length) break

    // Try to match the team's group to the slot's pool if specified
    const poolMatch = slot.away_placeholder?.match(/\(([A-L/]+)\)/)
    const pool = poolMatch ? poolMatch[1].split("/") : null

    // Find the best available team that fits this pool
    let chosenIdx = -1
    for (let i = teamIdx; i < best8.length; i++) {
      if (!pool || pool.includes(best8[i].group)) {
        chosenIdx = i
        break
      }
    }
    if (chosenIdx === -1) chosenIdx = teamIdx // Fallback: just use next best

    const team = best8[chosenIdx]
    // Remove from array to avoid reuse
    best8.splice(chosenIdx, 1)

    const { error: uErr } = await supabase
      .from("fixtures")
      .update({
        away_team_id: team.team_id,
        away_team_name: team.team_name,
        away_team_code: team.team_code,
        away_team_flag: team.team_flag,
        updated_at: new Date().toISOString(),
      })
      .eq("id", slot.id)

    if (uErr) throw new Error(`Update Mejor 3ro slot ${slot.id}: ${uErr.message}`)
    updated++
  }

  return updated
}

// -------------------------------------------------------------------
// 4. Advance knockout rounds (winner fills next fixture)
// -------------------------------------------------------------------

export async function advanceKnockout(supabase: SupabaseClient) {
  // Bracket advancement map: bracket_position → [nextFixturePosition, side]
  // "side" is "home" or "away" in the next fixture
  const ADVANCE: Record<string, { next: string; side: "home" | "away" }> = {
    "R32-01": { next: "R16-01", side: "home" },
    "R32-02": { next: "R16-01", side: "away" },
    "R32-03": { next: "R16-02", side: "home" },
    "R32-04": { next: "R16-02", side: "away" },
    "R32-05": { next: "R16-03", side: "home" },
    "R32-06": { next: "R16-03", side: "away" },
    "R32-07": { next: "R16-04", side: "home" },
    "R32-08": { next: "R16-04", side: "away" },
    "R32-09": { next: "R16-05", side: "home" },
    "R32-10": { next: "R16-05", side: "away" },
    "R32-11": { next: "R16-06", side: "home" },
    "R32-12": { next: "R16-06", side: "away" },
    "R32-13": { next: "R16-07", side: "home" },
    "R32-14": { next: "R16-07", side: "away" },
    "R32-15": { next: "R16-08", side: "home" },
    "R32-16": { next: "R16-08", side: "away" },
    "R16-01": { next: "QF-01", side: "home" },
    "R16-02": { next: "QF-01", side: "away" },
    "R16-03": { next: "QF-02", side: "home" },
    "R16-04": { next: "QF-02", side: "away" },
    "R16-05": { next: "QF-03", side: "home" },
    "R16-06": { next: "QF-03", side: "away" },
    "R16-07": { next: "QF-04", side: "home" },
    "R16-08": { next: "QF-04", side: "away" },
    "QF-01": { next: "SF-01", side: "home" },
    "QF-02": { next: "SF-01", side: "away" },
    "QF-03": { next: "SF-02", side: "home" },
    "QF-04": { next: "SF-02", side: "away" },
    "SF-01": { next: "FIN", side: "home" },
    "SF-02": { next: "FIN", side: "away" },
  }

  // Losers go to 3rd place game
  const LOSER_TO_3P: Record<string, "home" | "away"> = {
    "SF-01": "home",
    "SF-02": "away",
  }

  // Fetch all finished knockout fixtures
  const { data: knockoutFixtures, error } = await supabase
    .from("fixtures")
    .select("*")
    .in("phase", ["round_of_32", "round_of_16", "quarterfinals", "semifinals"])
    .eq("status", "finished")
    .not("bracket_position", "is", null)

  if (error) throw new Error(`Fetch knockout fixtures: ${error.message}`)

  // Fetch all fixtures with bracket positions (for the "next" lookup)
  const { data: allBracketFixtures, error: allErr } = await supabase
    .from("fixtures")
    .select("id, bracket_position, home_team_id, away_team_id")
    .not("bracket_position", "is", null)

  if (allErr) throw new Error(`Fetch bracket fixtures: ${allErr.message}`)

  const byPosition: Record<string, { id: number; home_team_id: number | null; away_team_id: number | null }> = {}
  for (const f of allBracketFixtures as { id: number; bracket_position: string; home_team_id: number | null; away_team_id: number | null }[]) {
    byPosition[f.bracket_position] = f
  }

  let updated = 0

  for (const fixture of knockoutFixtures as FixtureRow[]) {
    const pos = fixture.bracket_position
    if (!pos) continue

    // Determine winner
    let winnerId: number | null = null
    let winnerName: string | null = null
    let winnerCode: string | null = null
    let winnerFlag: string | null = null
    let loserId: number | null = null
    let loserName: string | null = null
    let loserCode: string | null = null
    let loserFlag: string | null = null

    if (fixture.home_score === null || fixture.away_score === null) continue

    const winner = determineKnockoutWinner(
      fixture.home_score,
      fixture.away_score,
      fixture.went_to_penalties,
      fixture.penalties_winner
    )
    if (!winner) continue // draw with no penalty result yet

    if (winner === "home") {
      winnerId = fixture.home_team_id; winnerName = fixture.home_team_name; winnerCode = fixture.home_team_code; winnerFlag = fixture.home_team_flag
      loserId  = fixture.away_team_id; loserName  = fixture.away_team_name; loserCode  = fixture.away_team_code; loserFlag  = fixture.away_team_flag
    } else {
      winnerId = fixture.away_team_id; winnerName = fixture.away_team_name; winnerCode = fixture.away_team_code; winnerFlag = fixture.away_team_flag
      loserId  = fixture.home_team_id; loserName  = fixture.home_team_name; loserCode  = fixture.home_team_code; loserFlag  = fixture.home_team_flag
    }

    // Advance winner to next round
    const advance = ADVANCE[pos]
    if (advance) {
      const nextFixture = byPosition[advance.next]
      if (nextFixture) {
        const alreadySet = advance.side === "home" ? nextFixture.home_team_id : nextFixture.away_team_id
        if (!alreadySet) {
          const updateData = advance.side === "home"
            ? { home_team_id: winnerId, home_team_name: winnerName, home_team_code: winnerCode, home_team_flag: winnerFlag, updated_at: new Date().toISOString() }
            : { away_team_id: winnerId, away_team_name: winnerName, away_team_code: winnerCode, away_team_flag: winnerFlag, updated_at: new Date().toISOString() }

          const { error: uErr } = await supabase.from("fixtures").update(updateData).eq("id", nextFixture.id)
          if (uErr) throw new Error(`Advance winner to ${advance.next}: ${uErr.message}`)
          updated++
        }
      }
    }

    // Advance loser to 3P game if applicable
    const loserSide = LOSER_TO_3P[pos]
    if (loserSide && loserId) {
      const thirdPlace = byPosition["3P"]
      if (thirdPlace) {
        const alreadySet = loserSide === "home" ? thirdPlace.home_team_id : thirdPlace.away_team_id
        if (!alreadySet) {
          const updateData = loserSide === "home"
            ? { home_team_id: loserId, home_team_name: loserName, home_team_code: loserCode, home_team_flag: loserFlag, updated_at: new Date().toISOString() }
            : { away_team_id: loserId, away_team_name: loserName, away_team_code: loserCode, away_team_flag: loserFlag, updated_at: new Date().toISOString() }

          const { error: uErr } = await supabase.from("fixtures").update(updateData).eq("id", thirdPlace.id)
          if (uErr) throw new Error(`Advance loser to 3P: ${uErr.message}`)
          updated++
        }
      }
    }
  }

  return updated
}
