import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

// POST /api/quiniela/[id]/copy
// Creates a draft copy of a quiniela with all predictions and bracket picks.
// Only allowed before the global lock date.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()

  // Fetch original quiniela and verify ownership
  const { data: original } = await admin
    .from("quinielas")
    .select("*")
    .eq("id", id)
    .single()

  if (!original)                    return NextResponse.json({ error: "Not found" },  { status: 404 })
  if (original.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Check lock date — only block if admin has explicitly set a lock_date. null = open.
  const lockCfgRes = await admin.from("tournament_config").select("lock_date").eq("id", 1).maybeSingle()
  const lockDate: string | null = (lockCfgRes.data?.lock_date as string | null) ?? null
  if (lockDate && Date.now() >= new Date(lockDate).getTime()) {
    return NextResponse.json({ error: "copy_locked" }, { status: 403 })
  }

  // Parse and validate body
  const body = await req.json() as { name?: string; pool_id?: string }
  const name    = (body.name ?? "").trim()
  const pool_id = body.pool_id ?? original.pool_id

  if (!name)     return NextResponse.json({ error: "name_required" }, { status: 400 })
  if (!pool_id)  return NextResponse.json({ error: "pool_required" },  { status: 400 })

  // Verify user is a member of the target pool
  const { data: membership } = await admin
    .from("pool_members")
    .select("id")
    .eq("pool_id", pool_id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: "not_member" }, { status: 403 })

  // Check for duplicate name in target pool for this user
  const { data: existing } = await admin
    .from("quinielas")
    .select("id")
    .eq("user_id", user.id)
    .eq("pool_id", pool_id)
    .eq("name", name)
    .maybeSingle()

  if (existing) return NextResponse.json({ error: "duplicate_name" }, { status: 400 })

  // Fetch all picks from original
  const [{ data: predictions }, { data: bracketPicks }] = await Promise.all([
    admin.from("predictions")
      .select("fixture_id, home_score_pred, away_score_pred, predicts_penalties, penalties_winner")
      .eq("quiniela_id", id),
    admin.from("bracket_picks")
      .select("slot_key, home_score_pred, away_score_pred, predicts_penalties, penalties_winner, home_team_id_pred, away_team_id_pred, home_team_name_pred, away_team_name_pred, home_team_flag_pred, away_team_flag_pred")
      .eq("quiniela_id", id),
  ])

  // Insert new quiniela — draft status, all scores/points start at zero
  const { data: newQ, error: insertErr } = await admin
    .from("quinielas")
    .insert({
      user_id:                user.id,
      pool_id,
      name,
      status:                 "draft",
      is_test:                false,
      top_scorer_pick:        original.top_scorer_pick,
      top_scorer_player_id:   original.top_scorer_player_id,
      most_goals_team_pick:   original.most_goals_team_pick,
      most_goals_team_id:     original.most_goals_team_id,
      champion_team_name:     original.champion_team_name,
      champion_team_flag:     original.champion_team_flag,
      r32_synced_at:          original.r32_synced_at,
      total_points:           0,
      exact_results:          0,
      correct_winners:        0,
      top_scorer_points:      0,
      most_goals_team_points: 0,
    })
    .select("id")
    .single()

  if (insertErr || !newQ) {
    return NextResponse.json({ error: insertErr?.message ?? "insert_failed" }, { status: 500 })
  }

  const newId = newQ.id

  // Copy predictions
  if (predictions && predictions.length > 0) {
    const { error } = await admin.from("predictions").insert(
      predictions.map(p => ({ ...p, quiniela_id: newId }))
    )
    if (error) {
      await admin.from("quinielas").delete().eq("id", newId)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Copy bracket picks
  if (bracketPicks && bracketPicks.length > 0) {
    const { error } = await admin.from("bracket_picks").insert(
      bracketPicks.map(p => ({ ...p, quiniela_id: newId }))
    )
    if (error) {
      await Promise.all([
        admin.from("predictions").delete().eq("quiniela_id", newId),
        admin.from("quinielas").delete().eq("id", newId),
      ])
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ id: newId })
}
