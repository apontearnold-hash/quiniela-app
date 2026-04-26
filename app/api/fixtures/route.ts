import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { getPhaseFromRound } from "@/lib/scoring"

// El fetch a API-Football se hace desde el cliente (browser) para evitar
// problemas de TLS/SSL en el servidor Node.js. Esta ruta solo recibe
// los datos crudos y los guarda en Supabase.
export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: { response?: FixtureAPIResponse[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 })
  }

  const fixtures = body.response ?? []
  if (!fixtures.length) {
    return NextResponse.json({ message: "No se recibieron partidos", count: 0 })
  }

  try {
    let upserted = 0
    const batchSize = 50

    for (let i = 0; i < fixtures.length; i += batchSize) {
      const batch = fixtures.slice(i, i + batchSize)
      const rows = batch.map((f) => {
        const round = f.league?.round ?? ""
        const phase = getPhaseFromRound(round)
        const groupMatch = round.match(/Group\s+([A-Z])/i) || round.match(/Grupo\s+([A-Z])/i)
        const groupName = groupMatch ? `Grupo ${groupMatch[1].toUpperCase()}` : null

        return {
          id: f.fixture.id,
          league_id: f.league.id,
          season: f.league.season,
          round,
          phase,
          status: mapStatus(f.fixture.status.short),
          kickoff: f.fixture.date,
          home_team_id: f.teams.home.id,
          home_team_name: f.teams.home.name,
          home_team_code: f.teams.home.code ?? null,
          home_team_flag: f.teams.home.logo ?? null,
          away_team_id: f.teams.away.id,
          away_team_name: f.teams.away.name,
          away_team_code: f.teams.away.code ?? null,
          away_team_flag: f.teams.away.logo ?? null,
          group_name: groupName,
          home_score: f.goals?.home ?? null,
          away_score: f.goals?.away ?? null,
          penalty_home: f.score?.penalty?.home ?? null,
          penalty_away: f.score?.penalty?.away ?? null,
          went_to_penalties: !!(f.score?.penalty?.home !== null && f.score?.penalty?.home !== undefined),
          penalties_winner: getPenaltiesWinner(f),
          updated_at: new Date().toISOString(),
        }
      })

      const { error } = await supabase.from("fixtures").upsert(rows, { onConflict: "id" })
      if (error) throw new Error(`Supabase: ${error.message}`)
      upserted += rows.length
    }

    return NextResponse.json({ message: `✅ ${upserted} partidos sincronizados`, count: upserted })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.redirect("/admin")
}

function mapStatus(short: string): string {
  const map: Record<string, string> = {
    NS: "not_started", "1H": "live", HT: "live", "2H": "live",
    ET: "live", P: "live", FT: "finished", AET: "finished",
    PEN: "finished", CANC: "cancelled", PST: "postponed",
  }
  return map[short] ?? "not_started"
}

function getPenaltiesWinner(f: FixtureAPIResponse): string | null {
  const ph = f.score?.penalty?.home
  const pa = f.score?.penalty?.away
  if (ph == null || pa == null) return null
  return ph > pa ? "home" : "away"
}

interface FixtureAPIResponse {
  fixture: { id: number; date: string; status: { short: string } }
  league: { id: number; season: number; round: string }
  teams: {
    home: { id: number; name: string; code?: string; logo?: string }
    away: { id: number; name: string; code?: string; logo?: string }
  }
  goals: { home: number | null; away: number | null }
  score: { penalty?: { home: number | null; away: number | null } }
}
