import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { apiFetch, getApiKey, LEAGUE_ID, SEASON } from "@/lib/api-football"

// ── In-process cache ───────────────────────────────────────────────────────────
// Keeps rate limits reasonable. TTLs are conservative since the World Cup
// hasn't started yet; reduce them once it's live.

const CACHE = new Map<string, { data: unknown; expires: number }>()
const TTL = {
  live:      60_000,   // 1 min  — live score data
  upcoming: 300_000,   // 5 min  — next fixtures
  standings: 600_000,  // 10 min — group standings
}

function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key)
  if (hit && Date.now() < hit.expires) return Promise.resolve(hit.data as T)
  return fn().then(data => {
    CACHE.set(key, { data, expires: Date.now() + ttl })
    return data
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type TournamentFixture = {
  id: number
  date: string
  status: { short: string; elapsed: number | null }
  round: string
  home: { id: number; name: string; logo: string; winner: boolean | null }
  away: { id: number; name: string; logo: string; winner: boolean | null }
  goals: { home: number | null; away: number | null }
  penalty: { home: number | null; away: number | null }
}

export type StandingEntry = {
  rank: number
  team: { id: number; name: string; logo: string }
  points: number
  goalsDiff: number
  played: number
  win: number
  draw: number
  lose: number
  goalsFor: number
  goalsAgainst: number
  form: string | null
}

export type GroupStanding = { group: string; entries: StandingEntry[] }

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchLive(): Promise<TournamentFixture[]> {
  const res = await apiFetch(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}&live=all`)
  if (!res.ok) return []
  const json = await res.json()
  return mapFixtures(json.response ?? [])
}

async function fetchUpcoming(): Promise<TournamentFixture[]> {
  const res = await apiFetch(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}&next=12`)
  if (!res.ok) return []
  const json = await res.json()
  return mapFixtures(json.response ?? [])
}

async function fetchStandings(): Promise<GroupStanding[]> {
  const res = await apiFetch(`/standings?league=${LEAGUE_ID}&season=${SEASON}`)
  if (!res.ok) return []
  const json = await res.json()
  const leagueData = json.response?.[0]?.league
  if (!leagueData?.standings) return []

  return (leagueData.standings as unknown[][]).map((group: unknown[], idx: number) => ({
    group: `Grupo ${String.fromCharCode(65 + idx)}`,
    entries: (group as Record<string, unknown>[]).map(e => ({
      rank:         e.rank as number,
      team:         e.team as StandingEntry["team"],
      points:       e.points as number,
      goalsDiff:    e.goalsDiff as number,
      form:         (e.form as string | null) ?? null,
      played:       (e.all as { played: number }).played,
      win:          (e.all as { win: number }).win,
      draw:         (e.all as { draw: number }).draw,
      lose:         (e.all as { lose: number }).lose,
      goalsFor:     (e.all as { goals: { for: number } }).goals.for,
      goalsAgainst: (e.all as { goals: { against: number } }).goals.against,
    })),
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFixtures(raw: any[]): TournamentFixture[] {
  return raw.map(r => ({
    id:     r.fixture.id,
    date:   r.fixture.date,
    status: { short: r.fixture.status.short, elapsed: r.fixture.status.elapsed },
    round:  r.league?.round ?? "",
    home:   { id: r.teams.home.id, name: r.teams.home.name, logo: r.teams.home.logo, winner: r.teams.home.winner },
    away:   { id: r.teams.away.id, name: r.teams.away.name, logo: r.teams.away.logo, winner: r.teams.away.winner },
    goals:  { home: r.goals.home, away: r.goals.away },
    penalty: { home: r.score?.penalty?.home ?? null, away: r.score?.penalty?.away ?? null },
  }))
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!getApiKey()) {
    return NextResponse.json({ error: "no_api_key", live: [], upcoming: [], standings: [] })
  }

  const type = req.nextUrl.searchParams.get("type") ?? "all"

  try {
    if (type === "live") {
      const live = await cached("live", TTL.live, fetchLive)
      return NextResponse.json({ live })
    }
    if (type === "upcoming") {
      const upcoming = await cached("upcoming", TTL.upcoming, fetchUpcoming)
      return NextResponse.json({ upcoming })
    }
    if (type === "standings") {
      const standings = await cached("standings", TTL.standings, fetchStandings)
      return NextResponse.json({ standings })
    }

    // type=all — fetch all three in parallel
    const [live, upcoming, standings] = await Promise.all([
      cached("live",      TTL.live,      fetchLive),
      cached("upcoming",  TTL.upcoming,  fetchUpcoming),
      cached("standings", TTL.standings, fetchStandings),
    ])
    return NextResponse.json({ live, upcoming, standings })
  } catch (err) {
    console.error("[tournament/data]", err)
    return NextResponse.json({ error: "fetch_failed", live: [], upcoming: [], standings: [] })
  }
}
