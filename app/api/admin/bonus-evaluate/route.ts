import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import { recalculateAllPoints } from "@/lib/recalculate"
import { BONUS_POINTS } from "@/lib/types"

/**
 * POST /api/admin/bonus-evaluate
 *
 * Body:
 *   top_scorer_winners?: string[]   — winning player names (ties = multiple)
 *   most_goals_team_winners?: string[] — winning team names (ties = multiple)
 *
 * Awards top_scorer_points / most_goals_team_points on every quiniela that
 * matched any winner, then calls recalculateAllPoints to sync total_points.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const topScorerWinners: string[]   = (body.top_scorer_winners ?? []).map((s: string) => s.trim().toLowerCase()).filter(Boolean)
  const mostGoalsWinners: string[]   = (body.most_goals_team_winners ?? []).map((s: string) => s.trim().toLowerCase()).filter(Boolean)

  if (topScorerWinners.length === 0 && mostGoalsWinners.length === 0) {
    return NextResponse.json({ error: "At least one winner is required" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Load all quinielas
  const { data: quinielas, error: qErr } = await admin
    .from("quinielas")
    .select("id, top_scorer_pick, most_goals_team_pick")

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  let scorerCount = 0
  let goalsCount  = 0

  for (const q of quinielas ?? []) {
    const updates: Record<string, number> = {}

    if (topScorerWinners.length > 0) {
      const pick = (q.top_scorer_pick ?? "").trim().toLowerCase()
      updates.top_scorer_points = topScorerWinners.includes(pick) ? BONUS_POINTS.top_scorer : 0
      if (topScorerWinners.includes(pick)) scorerCount++
    }

    if (mostGoalsWinners.length > 0) {
      const pick = (q.most_goals_team_pick ?? "").trim().toLowerCase()
      updates.most_goals_team_points = mostGoalsWinners.includes(pick) ? BONUS_POINTS.most_goals_team : 0
      if (mostGoalsWinners.includes(pick)) goalsCount++
    }

    if (Object.keys(updates).length > 0) {
      await admin.from("quinielas").update(updates).eq("id", q.id)
    }
  }

  // Persist the declared winners for reference
  const winnerRows = [
    ...topScorerWinners.map(name => ({ category: "top_scorer", winner_name: name })),
    ...mostGoalsWinners.map(name => ({ category: "most_goals_team", winner_name: name })),
  ]
  if (winnerRows.length > 0) {
    await admin.from("bonus_winners").upsert(winnerRows, { onConflict: "category,winner_name" })
  }

  // Sync total_points
  const { predictions, quinielas: qTotal } = await recalculateAllPoints(admin)

  return NextResponse.json({
    message: `Bonos evaluados. Goleador: ${scorerCount} aciertos · Más goles: ${goalsCount} aciertos. Totales recalculados: ${predictions} preds, ${qTotal} quinielas.`,
    top_scorer_count: scorerCount,
    most_goals_count: goalsCount,
  })
}
