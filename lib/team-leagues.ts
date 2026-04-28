// Confederation leagues used for team qualifier context cards.
// The endpoint tries these in parallel (standings only) to identify
// which confederation a team belongs to, then fetches fixtures +
// top scorers only for the matched league.
//
// NOTE: API-Football counts each request against the daily quota.
// Parallel standings discovery = 1 round-trip but N requests (one per league).
// Cache responses server-side (e.g., Next.js unstable_cache or Redis)
// before launching to reduce quota usage in production.

export interface LeagueConfig {
  leagueId:      number
  season:        number
  name:          string
  confederation: string
  hasStandings:  boolean   // from discovery script — skip standings fetch if false
}

// Ordered roughly by World Cup 2026 qualification interest.
// OFC has no standings coverage → hasStandings: false, so teams (New Zealand)
// are found via fixtures fallback instead.
export const CONFEDERATION_LEAGUES: LeagueConfig[] = [
  { leagueId: 34, season: 2026, name: "Eliminatorias CONMEBOL 2026", confederation: "CONMEBOL", hasStandings: true  },
  { leagueId: 32, season: 2024, name: "Eliminatorias UEFA 2026",      confederation: "UEFA",     hasStandings: true  },
  { leagueId: 30, season: 2026, name: "Eliminatorias AFC 2026",       confederation: "AFC",      hasStandings: true  },
  { leagueId: 29, season: 2023, name: "Eliminatorias CAF 2026",       confederation: "CAF",      hasStandings: true  },
  // CONCACAF: WC Qual 2026 (31) has 0 fixtures yet → use Gold Cup 2025 instead
  { leagueId: 22, season: 2025, name: "CONCACAF Gold Cup 2025",       confederation: "CONCACAF", hasStandings: true  },
  { leagueId: 33, season: 2026, name: "Eliminatorias OFC 2026",       confederation: "OFC",      hasStandings: false },
]

// ── Standings helper ──────────────────────────────────────────────────────────

type StandingEntry = Record<string, unknown> & { team: { id: number } }

/** Searches all standings groups returned by the API for a given team ID. */
export function findTeamInStandings(
  standingsGroups: unknown[][],
  teamId: number,
): StandingEntry | null {
  for (const group of standingsGroups) {
    const entry = (group as StandingEntry[]).find(t => t.team?.id === teamId)
    if (entry) return entry
  }
  return null
}
