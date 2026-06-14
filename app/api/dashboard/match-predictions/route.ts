import { createClient, createAdminClient } from "@/lib/supabase-server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const poolId    = searchParams.get("poolId")
  const fixtureId = searchParams.get("fixtureId")

  if (!poolId || !fixtureId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()

  // Pool membership guard
  const { data: membership } = await admin
    .from("pool_members")
    .select("pool_id")
    .eq("pool_id", poolId)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const numId = parseInt(fixtureId, 10)
  if (isNaN(numId)) return NextResponse.json({ error: "Invalid fixtureId" }, { status: 400 })

  // Fetch fixture
  const { data: fixture } = await admin
    .from("fixtures")
    .select("id, home_team_name, away_team_name, home_team_flag, away_team_flag, status, home_score, away_score, phase, kickoff, bracket_position, went_to_penalties, penalties_winner")
    .eq("id", numId)
    .single()
  if (!fixture) return NextResponse.json({ error: "Fixture not found" }, { status: 404 })

  // Submitted quinielas in this pool (no test quinielas)
  const { data: quinielasRaw } = await admin
    .from("quinielas")
    .select("id, name, profiles(display_name)")
    .eq("status", "submitted")
    .eq("pool_id", poolId)
    .eq("is_test", false)

  type QRow = { id: string; name: string; profiles: { display_name: string | null } | null }
  const quinielas = (quinielasRaw ?? []) as unknown as QRow[]

  if (quinielas.length === 0) {
    return NextResponse.json({ fixture, predictions: [] })
  }

  const quinielaIds = quinielas.map(q => q.id)
  const quinielaMap = new Map(quinielas.map(q => [q.id, q]))

  type PredRow = {
    quinielaId: string
    quinielaName: string
    playerName: string | null
    homeScorePred: number | null
    awayScorePred: number | null
    predictsPenalties: boolean
    penaltiesWinner: string | null
    pointsEarned: number
    homeTeamNamePred: string | null
    awayTeamNamePred: string | null
  }

  let predictions: PredRow[] = []

  if (fixture.bracket_position) {
    // Knockout phase: keyed by slot_key in bracket_picks
    const { data: picks } = await admin
      .from("bracket_picks")
      .select("quiniela_id, home_score_pred, away_score_pred, predicts_penalties, penalties_winner, points_earned, home_team_name_pred, away_team_name_pred")
      .eq("slot_key", fixture.bracket_position)
      .in("quiniela_id", quinielaIds)

    predictions = (picks ?? []).map(pick => {
      const q = quinielaMap.get(pick.quiniela_id)
      return {
        quinielaId:       pick.quiniela_id,
        quinielaName:     q?.name ?? "?",
        playerName:       q?.profiles?.display_name ?? null,
        homeScorePred:    pick.home_score_pred,
        awayScorePred:    pick.away_score_pred,
        predictsPenalties: pick.predicts_penalties,
        penaltiesWinner:  pick.penalties_winner,
        pointsEarned:     pick.points_earned,
        homeTeamNamePred: pick.home_team_name_pred,
        awayTeamNamePred: pick.away_team_name_pred,
      }
    })
  } else {
    // Group stage: keyed by fixture_id in predictions
    const { data: preds } = await admin
      .from("predictions")
      .select("quiniela_id, home_score_pred, away_score_pred, predicts_penalties, penalties_winner, points_earned")
      .eq("fixture_id", numId)
      .in("quiniela_id", quinielaIds)

    predictions = (preds ?? []).map(pred => {
      const q = quinielaMap.get(pred.quiniela_id)
      return {
        quinielaId:       pred.quiniela_id,
        quinielaName:     q?.name ?? "?",
        playerName:       q?.profiles?.display_name ?? null,
        homeScorePred:    pred.home_score_pred,
        awayScorePred:    pred.away_score_pred,
        predictsPenalties: pred.predicts_penalties,
        penaltiesWinner:  pred.penalties_winner,
        pointsEarned:     pred.points_earned,
        homeTeamNamePred: null,
        awayTeamNamePred: null,
      }
    })
  }

  predictions.sort((a, b) => a.quinielaName.localeCompare(b.quinielaName))

  return NextResponse.json({ fixture, predictions })
}
