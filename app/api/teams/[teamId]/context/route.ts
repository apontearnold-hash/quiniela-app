import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { apiFetch } from "@/lib/api-football"
import { CONFEDERATION_LEAGUES, findTeamInStandings, type LeagueConfig } from "@/lib/team-leagues"

// GET /api/teams/[teamId]/context
//
// Two modes:
//   ?league=34&season=2026  → use that specific league directly (fast, 3 calls)
//   (no params)             → discover confederation automatically (parallel standings
//                             across all CONFEDERATION_LEAGUES, then fixtures + topscorers)
//
// Response always includes a `competition` object so the UI knows which
// competition name to display. Nothing is written to Supabase.

// ── Shared types ──────────────────────────────────────────────────────────────

type ApiFixture = {
  fixture: { id: number; date: string; timestamp: number; status: { short: string } }
  teams:   { home: { id: number; name: string; logo: string }; away: { id: number; name: string; logo: string } }
  goals:   { home: number | null; away: number | null }
}

type ApiTopScorer = {
  player:     { id: number; name: string; photo: string }
  statistics: { team: { id: number; name: string; logo: string }; goals: { total: number | null } }[]
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function shapeStanding(raw: Record<string, unknown>) {
  return {
    rank:        raw.rank        as number,
    points:      raw.points      as number,
    goalsDiff:   raw.goalsDiff   as number,
    form:       (raw.form        as string | null) ?? null,
    all: raw.all as {
      played: number; win: number; draw: number; lose: number
      goals:  { for: number; against: number }
    },
  }
}

function shapeFixtures(response: ApiFixture[], teamId: number) {
  return response
    .sort((a, b) => b.fixture.timestamp - a.fixture.timestamp)
    .slice(0, 5)
    .map((f) => {
      const isHome       = f.teams.home.id === teamId
      const goalsFor     = isHome ? f.goals.home : f.goals.away
      const goalsAgainst = isHome ? f.goals.away : f.goals.home
      const opponent     = isHome ? f.teams.away : f.teams.home
      let result: "W" | "D" | "L" | null = null
      if (goalsFor !== null && goalsAgainst !== null) {
        result = goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D"
      }
      return {
        fixtureId:    f.fixture.id,
        date:         f.fixture.date.slice(0, 10),
        statusShort:  f.fixture.status.short,
        isHome,
        opponent:     { id: opponent.id, name: opponent.name, logo: opponent.logo },
        goalsFor,
        goalsAgainst,
        result,
      }
    })
}

function shapeTopScorers(response: ApiTopScorer[]) {
  return response.slice(0, 5).map((p) => ({
    id:    p.player.id,
    name:  p.player.name,
    photo: p.player.photo,
    team:  p.statistics[0]?.team.name ?? "",
    goals: p.statistics[0]?.goals.total ?? 0,
  }))
}

/** Fetch fixtures + top scorers for a known league and return shaped data. */
async function fetchLeagueDetails(cfg: LeagueConfig, teamId: number) {
  const [fxRes, tsRes] = await Promise.all([
    apiFetch(`/fixtures?league=${cfg.leagueId}&season=${cfg.season}&team=${teamId}&last=5`, { revalidate: 3600 }),
    apiFetch(`/players/topscorers?league=${cfg.leagueId}&season=${cfg.season}`, { revalidate: 3600 }),
  ])
  const [fxData, tsData] = await Promise.all([fxRes.json(), tsRes.json()])
  return {
    recentFixtures: shapeFixtures(fxData.response ?? [], teamId),
    topScorers:     shapeTopScorers(tsData.response ?? []),
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { teamId } = await params
  const tid = parseInt(teamId, 10)
  if (isNaN(tid)) return NextResponse.json({ error: "Invalid teamId" }, { status: 400 })

  const { searchParams } = new URL(request.url)
  const leagueParam = searchParams.get("league")
  const seasonParam = searchParams.get("season")

  try {
    // ── Mode A: specific league provided (fast path, backward compatible) ──
    if (leagueParam && seasonParam) {
      const cfg = CONFEDERATION_LEAGUES.find(
        l => l.leagueId === parseInt(leagueParam) && l.season === parseInt(seasonParam),
      ) ?? {
        leagueId:      parseInt(leagueParam),
        season:        parseInt(seasonParam),
        name:          `Liga ${leagueParam}`,
        confederation: "Unknown",
        hasStandings:  true,
      }

      const stRes  = await apiFetch(`/standings?league=${cfg.leagueId}&season=${cfg.season}`, { revalidate: 3600 })
      const stData = await stRes.json()
      const groups = stData.response?.[0]?.league?.standings ?? []
      const raw    = findTeamInStandings(groups, tid)

      if (!raw) return NextResponse.json({ found: false, competition: cfg })

      const { recentFixtures, topScorers } = await fetchLeagueDetails(cfg, tid)
      return NextResponse.json({
        found:          true,
        competition:    cfg,
        standing:       shapeStanding(raw),
        recentFixtures,
        topScorers,
      })
    }

    // ── Mode B: auto-discover confederation ───────────────────────────────
    // Phase 1: fetch standings from all leagues in parallel.
    // Only leagues with hasStandings:true are checked here — OFC is handled
    // separately below via a fixtures fallback.
    const standingCandidates = CONFEDERATION_LEAGUES.filter(l => l.hasStandings)
    const noStandingCandidates = CONFEDERATION_LEAGUES.filter(l => !l.hasStandings)

    const standingsResults = await Promise.allSettled(
      standingCandidates.map(async (cfg) => {
        const res  = await apiFetch(`/standings?league=${cfg.leagueId}&season=${cfg.season}`, { revalidate: 3600 })
        const data = await res.json()
        const groups: unknown[][] = data.response?.[0]?.league?.standings ?? []
        const raw = findTeamInStandings(groups, tid)
        return { cfg, raw }
      }),
    )

    // Pick the first confederation where the team appears in standings
    let matchedCfg: LeagueConfig | null = null
    let matchedRaw: Record<string, unknown> | null = null

    for (const result of standingsResults) {
      if (result.status === "fulfilled" && result.value.raw) {
        matchedCfg = result.value.cfg
        matchedRaw = result.value.raw
        break
      }
    }

    // Phase 1b: OFC fallback — check recent fixtures for team
    if (!matchedCfg) {
      for (const cfg of noStandingCandidates) {
        const fxRes  = await apiFetch(`/fixtures?league=${cfg.leagueId}&season=${cfg.season}&team=${tid}&last=1`, { revalidate: 3600 })
        const fxData = await fxRes.json()
        if ((fxData.response ?? []).length > 0) {
          matchedCfg = cfg
          break
        }
      }
    }

    if (!matchedCfg) {
      return NextResponse.json({ found: false, competition: null })
    }

    // Phase 2: fetch fixtures + topscorers only for the matched league
    const { recentFixtures, topScorers } = await fetchLeagueDetails(matchedCfg, tid)

    return NextResponse.json({
      found:          true,
      competition:    matchedCfg,
      standing:       matchedRaw ? shapeStanding(matchedRaw) : null,
      recentFixtures,
      topScorers,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
