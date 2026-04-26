/**
 * bracket-projection.ts
 *
 * Pure TypeScript helpers for computing a user's projected bracket based
 * on their own picks — completely independent from the official tournament
 * bracket advancement (lib/bracket.ts).
 *
 * Used by PredictionsEditor to:
 *  - Show live projected group standings while filling picks
 *  - Resolve projected team names for R32→Final fixtures
 *  - Assign the "best third-place" teams to the 8 "Mejor 3ro" slots
 */

import type { Fixture, Phase } from "./types"

// ── Exported types ─────────────────────────────────────────────────────────────

export interface ProjectedTeam {
  teamId: number
  teamName: string
  teamFlag: string | null
  teamCode: string | null
  /** "Grupo A", "Grupo B", etc. — needed for best-3rd slot assignment */
  groupName: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  gd: number
  pts: number
}

export type ResolvedBracket = Record<
  number,  // fixture id
  {
    homeName: string
    awayName: string
    homeFlag: string | null
    awayFlag: string | null
    /** true when team is projected (not yet officially assigned) */
    homeIsProjected: boolean
    awayIsProjected: boolean
  }
>

// ── Centralized winner determination ──────────────────────────────────────────

/**
 * Determine the winner of a knockout match using the canonical rule:
 *   home_score > away_score  → "home"
 *   away_score > home_score  → "away"
 *   equal scores + wentToPenalties + penaltiesWinner set → penaltiesWinner
 *   otherwise (still a draw, no penalty result)  → null (no winner yet)
 *
 * penaltiesWinner uses the string "home" | "away" in this project.
 * Used by both the admin bracket engine (lib/bracket.ts) and the per-user
 * projected bracket (resolveKnockoutBracket below).
 */
export function determineKnockoutWinner(
  homeScore: number,
  awayScore: number,
  wentToPenalties: boolean,
  penaltiesWinner: string | null
): "home" | "away" | null {
  if (homeScore > awayScore) return "home"
  if (awayScore > homeScore) return "away"
  // Scores level → penalties decide
  if (wentToPenalties && penaltiesWinner === "home") return "home"
  if (wentToPenalties && penaltiesWinner === "away") return "away"
  return null // draw, no decisive result yet
}

// ── Internal sort ──────────────────────────────────────────────────────────────

function sortTeams(teams: ProjectedTeam[]): ProjectedTeam[] {
  return [...teams].sort(
    (a, b) =>
      b.pts - a.pts ||
      b.gd - a.gd ||
      b.goalsFor - a.goalsFor ||
      a.teamName.localeCompare(b.teamName) // stable alpha tiebreak
  )
}

// Extracts the A–L letter from any group name format:
// "Grupo A", "Group A", "A", "Grupo F", etc.
function groupLetter(name: string): string {
  const m = name.match(/\b([A-L])\b/i)
  return m ? m[1].toUpperCase() : ""
}

// ── 1. Group standings ─────────────────────────────────────────────────────────

/**
 * Compute projected standings for a single group from the user's picks.
 * Teams with no picks still appear with 0 pts (so the table always shows all teams).
 */
export function computeGroupStandings(
  groupFixtures: Fixture[],
  preds: Record<number, { home: string; away: string }>,
  groupName: string
): ProjectedTeam[] {
  const teams = new Map<number, ProjectedTeam>()

  for (const f of groupFixtures) {
    if (f.home_team_id != null && !teams.has(f.home_team_id)) {
      teams.set(f.home_team_id, {
        teamId: f.home_team_id, teamName: f.home_team_name ?? "?",
        teamFlag: f.home_team_flag, teamCode: f.home_team_code, groupName,
        played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, gd: 0, pts: 0,
      })
    }
    if (f.away_team_id != null && !teams.has(f.away_team_id)) {
      teams.set(f.away_team_id, {
        teamId: f.away_team_id, teamName: f.away_team_name ?? "?",
        teamFlag: f.away_team_flag, teamCode: f.away_team_code, groupName,
        played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, gd: 0, pts: 0,
      })
    }
    if (!f.home_team_id || !f.away_team_id) continue

    const pred = preds[f.id]
    if (!pred || pred.home === "" || pred.away === "") continue
    const h = parseInt(pred.home), a = parseInt(pred.away)
    if (isNaN(h) || isNaN(a)) continue

    const home = teams.get(f.home_team_id)!
    const away = teams.get(f.away_team_id)!
    home.played++; away.played++
    home.goalsFor += h; home.goalsAgainst += a
    away.goalsFor += a; away.goalsAgainst += h
    home.gd = home.goalsFor - home.goalsAgainst
    away.gd = away.goalsFor - away.goalsAgainst
    if (h > a) { home.won++; home.pts += 3; away.lost++ }
    else if (h < a) { away.won++; away.pts += 3; home.lost++ }
    else { home.drawn++; home.pts++; away.drawn++; away.pts++ }
  }

  return sortTeams([...teams.values()])
}

// ── 2. Best third-place teams ──────────────────────────────────────────────────

/**
 * Rank all 12 third-place teams and return the best 8 (those that advance
 * to the Round of 32 in the 2026 World Cup format).
 *
 * Ranking criteria (in order):
 *   1. Points          (desc)
 *   2. Goal difference (desc)
 *   3. Goals for       (desc)
 *   4. Team name A→Z   (stable, deterministic)
 *
 * Returns array sorted best → worst, length ≤ 8.
 */
export function computeBest3rd(
  groupProjections: Map<string, ProjectedTeam[]>
): ProjectedTeam[] {
  const thirdPlaces: ProjectedTeam[] = []
  groupProjections.forEach(standings => {
    if (standings.length >= 3) {
      // standings is already sorted by computeGroupStandings
      thirdPlaces.push(standings[2])
    }
  })
  if (typeof window !== "undefined") {
    console.log("[best3rd] thirds:", thirdPlaces.map(t => `${t.teamName}(${t.groupName}) ${t.pts}pts`))
    console.log("[best3rd] best8:", sortTeams(thirdPlaces).slice(0,8).map(t => t.teamName))
  }
  return sortTeams(thirdPlaces).slice(0, 8)
}

// ── 3. Full knockout bracket resolution ───────────────────────────────────────

/**
 * Resolve the projected team for every knockout fixture slot based on:
 *
 *   • Official team already set on the fixture       → use it (not projected)
 *   • "1ro/2do Grupo X"                              → from groupProjections
 *   • "Mejor 3ro (A/B/C/D/F)"                        → greedy pool-aware
 *                                                       assignment from best3rd
 *   • "Ganador R32-NN" / "Ganador R16-NN" etc.       → winner of that fixture
 *                                                       from the user's pick
 *   • "Perdedor SF-NN"                                → loser (3rd-place game)
 *
 * Processes phases in bracket order (R32 → R16 → QF → SF → Final) so that
 * winner/loser cascading works correctly.
 *
 * "Mejor 3ro" slots are filled greedily in R32 bracket_position order:
 * for each slot, the best unassigned team whose group is in the slot's pool
 * is assigned. If no team fits the pool constraint, the globally-best
 * unassigned team is used as a fallback (prevents blank slots).
 */
export function resolveKnockoutBracket(
  byPhase: Partial<Record<Phase, Fixture[]>>,
  groupProjections: Map<string, ProjectedTeam[]>,
  best3rd: ProjectedTeam[],
  preds: Record<number, { home: string; away: string; predicts_penalties?: boolean; penalties_winner?: string }>
): ResolvedBracket {
  const winnerByPos = new Map<string, { name: string; flag: string | null }>()
  const loserByPos  = new Map<string, { name: string; flag: string | null }>()
  const assignedBest3rd = new Set<number>() // teamId of already-assigned 3rd-place teams
  const result: ResolvedBracket = {}

  function resolveSlot(
    placeholder: string | null,
    existingName: string | null,
    existingFlag: string | null,
    pool: string[] | null
  ): { name: string; flag: string | null; isProjected: boolean } {
    // Official assignment already in DB
    if (existingName) return { name: existingName, flag: existingFlag, isProjected: false }
    if (!placeholder)  return { name: "TBD",         flag: null,        isProjected: true  }

    // "1ro Grupo A" / "2do Grupo B"
    const gm = placeholder.match(/^([12])(?:ro|do)\s+Grupo\s+([A-L])$/i)
    if (gm) {
      const idx    = parseInt(gm[1]) - 1
      const letter = gm[2].toUpperCase()
      let st: ProjectedTeam[] | undefined
      for (const [key, val] of groupProjections) {
        if (groupLetter(key) === letter) { st = val; break }
      }
      if (st?.[idx]) return { name: st[idx].teamName, flag: st[idx].teamFlag, isProjected: true }
      return { name: placeholder, flag: null, isProjected: true }
    }

    // "Mejor 3ro (A/B/C/D/F)" — greedy pool-aware assignment
    if (placeholder.startsWith("Mejor 3ro") && pool) {
      // 1st pass: best unassigned team whose group letter is in the pool
      const byPool = best3rd.find(t => {
        if (assignedBest3rd.has(t.teamId)) return false
        return pool.includes(groupLetter(t.groupName))
      })
      if (byPool) {
        assignedBest3rd.add(byPool.teamId)
        return { name: byPool.teamName, flag: byPool.teamFlag, isProjected: true }
      }
      // 2nd pass: any unassigned best-3rd (fallback when pool is fully taken)
      const any = best3rd.find(t => !assignedBest3rd.has(t.teamId))
      if (any) {
        assignedBest3rd.add(any.teamId)
        return { name: any.teamName, flag: any.teamFlag, isProjected: true }
      }
      return { name: placeholder, flag: null, isProjected: true }
    }

    // "Ganador R32-01" / "Ganador QF-02" etc.
    const wm = placeholder.match(/^Ganador\s+((?:R32|R16|QF|SF)-\d+)$/i)
    if (wm) {
      const t = winnerByPos.get(wm[1])
      return t ? { ...t, isProjected: true } : { name: placeholder, flag: null, isProjected: true }
    }

    // "Perdedor SF-01" (3rd-place game)
    const lm = placeholder.match(/^Perdedor\s+(SF-\d+)$/i)
    if (lm) {
      const t = loserByPos.get(lm[1])
      return t ? { ...t, isProjected: true } : { name: placeholder, flag: null, isProjected: true }
    }

    return { name: placeholder, flag: null, isProjected: true }
  }

  const knockoutPhases: Phase[] = ["round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"]

  for (const phase of knockoutPhases) {
    const fixtures = [...(byPhase[phase] ?? [])].sort((a, b) => {
      const aPos = a.bracket_position ?? ""
      const bPos = b.bracket_position ?? ""
      // "3P" must always be processed last within its phase (semifinals) because
      // it depends on the losers of SF-01 and SF-02. Alphabetically "3" < "S"
      // which would wrongly put "3P" before "SF-01"/"SF-02".
      if (aPos === "3P") return 1
      if (bPos === "3P") return -1
      return aPos.localeCompare(bPos)
    })

    for (const f of fixtures) {
      // Parse pool from "Mejor 3ro (A/B/C/D/F)" placeholders
      const homePool = f.home_placeholder?.match(/^Mejor 3ro \(([A-L/]+)\)$/i)?.[1]?.split("/") ?? null
      const awayPool = f.away_placeholder?.match(/^Mejor 3ro \(([A-L/]+)\)$/i)?.[1]?.split("/") ?? null

      const home = resolveSlot(f.home_placeholder, f.home_team_name, f.home_team_flag, homePool)
      const away = resolveSlot(f.away_placeholder, f.away_team_name, f.away_team_flag, awayPool)

      result[f.id] = {
        homeName: home.name, awayName: away.name,
        homeFlag: home.flag, awayFlag: away.flag,
        homeIsProjected: home.isProjected,
        awayIsProjected: away.isProjected,
      }

      // Cascade winner/loser into subsequent rounds using the same rule
      // as the admin bracket engine (penalties included).
      if (!f.bracket_position) continue
      const pred = preds[f.id]
      if (!pred || pred.home === "" || pred.away === "") continue
      const h = parseInt(pred.home), a = parseInt(pred.away)
      if (isNaN(h) || isNaN(a)) continue

      const winner = determineKnockoutWinner(
        h, a,
        pred.predicts_penalties ?? false,
        pred.penalties_winner ?? null
      )

      if (winner === "home") {
        winnerByPos.set(f.bracket_position, { name: home.name, flag: home.flag })
        loserByPos.set(f.bracket_position, { name: away.name, flag: away.flag })
      } else if (winner === "away") {
        winnerByPos.set(f.bracket_position, { name: away.name, flag: away.flag })
        loserByPos.set(f.bracket_position, { name: home.name, flag: home.flag })
      }
      // null → draw with no penalty result yet — next round keeps placeholder
    }
  }

  return result
}
