/**
 * POST /api/admin/simulate
 * Creates N test quinielas (is_test=true) with random predictions for all fixtures.
 * Uses service role to bypass RLS.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-server"

const NAMES = [
  "Test User 1", "Test User 2", "Test User 3", "Test User 4", "Test User 5",
  "Test User 6", "Test User 7", "Test User 8", "Test User 9", "Test User 10",
]

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

export async function POST(request: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const count = Math.min(Math.max(parseInt(body.count ?? "5"), 1), 10)

  const admin = await createAdminClient()

  // Fetch all fixtures
  const { data: fixtures, error: fErr } = await admin.from("fixtures").select("id, phase")
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 })

  // Get or create a test profile
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", user.email)
    .single()

  if (!profile) return NextResponse.json({ error: "Admin profile not found" }, { status: 500 })

  const createdQuinielas: string[] = []

  for (let i = 0; i < count; i++) {
    const name = NAMES[i % NAMES.length] + " - Quiniela Prueba"
    const picks = ["Brasil", "Argentina", "Francia", "Alemania", "España", "Inglaterra", "Portugal", "México"]

    const { data: quiniela, error: qErr } = await admin
      .from("quinielas")
      .insert({
        user_id: profile.id,
        name,
        is_test: true,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        top_scorer_pick: "Erling Haaland",
        most_goals_team_pick: picks[randInt(0, picks.length - 1)],
      })
      .select("id")
      .single()

    if (qErr || !quiniela) continue
    createdQuinielas.push(quiniela.id)

    // Create random predictions for every fixture
    const predictions = (fixtures ?? []).map((f: { id: number; phase: string }) => {
      const homeScore = randInt(0, 4)
      const awayScore = randInt(0, 4)
      const isKnockout = f.phase !== "groups"
      const draw = homeScore === awayScore
      const predictsP = isKnockout && draw && Math.random() > 0.5

      return {
        quiniela_id: quiniela.id,
        fixture_id: f.id,
        home_score_pred: homeScore,
        away_score_pred: awayScore,
        predicts_penalties: predictsP,
        penalties_winner: predictsP ? (Math.random() > 0.5 ? "home" : "away") : null,
        points_earned: 0,
      }
    })

    // Batch insert predictions
    const batchSize = 100
    for (let j = 0; j < predictions.length; j += batchSize) {
      await admin.from("predictions").insert(predictions.slice(j, j + batchSize))
    }
  }

  return NextResponse.json({
    message: `✅ ${createdQuinielas.length} quinielas de prueba creadas`,
    quiniela_ids: createdQuinielas,
  })
}
