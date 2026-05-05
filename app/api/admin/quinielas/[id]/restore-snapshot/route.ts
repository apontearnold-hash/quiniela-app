import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import { createQuinielaSnapshot } from "@/lib/snapshot"

// POST /api/admin/quinielas/[id]/restore-snapshot
// Body: { snapshot_id: string }
//
// Strategy:
//   1. Validate admin + ownership of snapshot.
//   2. Take a restore_point snapshot of the CURRENT state before overwriting.
//   3. Restore quinielas fields (preserves user_id, pool_id, id).
//   4. Upsert predictions (onConflict quiniela_id,fixture_id) then delete extras.
//   5. Upsert bracket_picks (onConflict quiniela_id,slot_key) then delete extras.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const snapshotId = body.snapshot_id as string | undefined
  if (!snapshotId) return NextResponse.json({ error: "snapshot_id requerido" }, { status: 400 })

  const admin = createAdminClient()

  // Fetch the snapshot to restore
  const { data: snap, error: snapErr } = await admin
    .from("quiniela_snapshots")
    .select("*")
    .eq("id", snapshotId)
    .eq("quiniela_id", id)
    .single()

  if (snapErr || !snap) return NextResponse.json({ error: "Snapshot no encontrado" }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapData = snap.snapshot_data as any

  // ── Step 1: backup current state ──────────────────────────────────────────────
  try {
    await createQuinielaSnapshot(id, "restore_point", {
      createdBy: user.id,
      notes:     `Auto-backup before restoring snapshot ${snapshotId} (${snap.snapshot_type})`,
    })
  } catch (backupErr) {
    console.error("[restore-snapshot] backup failed:", backupErr)
    return NextResponse.json({
      error: "No se pudo crear el backup previo. Restauración cancelada por seguridad.",
    }, { status: 500 })
  }

  // ── Step 2: restore quinielas header fields ───────────────────────────────────
  const q = snapData.quiniela ?? {}
  const { error: quinielaErr } = await admin.from("quinielas").update({
    name:                  q.name,
    status:                q.status,
    submitted_at:          q.submitted_at,
    r32_synced_at:         q.r32_synced_at,
    top_scorer_pick:       q.top_scorer_pick,
    top_scorer_player_id:  q.top_scorer_player_id,
    most_goals_team_pick:  q.most_goals_team_pick,
    most_goals_team_id:    q.most_goals_team_id,
    top_scorer_points:     q.top_scorer_points     ?? 0,
    most_goals_team_points: q.most_goals_team_points ?? 0,
    champion_team_name:    q.champion_team_name,
    champion_team_flag:    q.champion_team_flag,
    total_points:          q.total_points           ?? 0,
    exact_results:         q.exact_results          ?? 0,
    correct_winners:       q.correct_winners        ?? 0,
  }).eq("id", id)

  if (quinielaErr) {
    return NextResponse.json({ error: `Error restaurando quiniela: ${quinielaErr.message}` }, { status: 500 })
  }

  // ── Step 3: restore predictions ───────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const predRows = (snapData.predictions ?? []).map((p: any) => ({
    quiniela_id:        id,
    fixture_id:         p.fixture_id,
    home_score_pred:    p.home_score_pred,
    away_score_pred:    p.away_score_pred,
    predicts_penalties: Boolean(p.predicts_penalties),
    penalties_winner:   p.penalties_winner ?? null,
    points_earned:      p.points_earned    ?? 0,
  }))

  if (predRows.length > 0) {
    const { error: predUpsertErr } = await admin
      .from("predictions")
      .upsert(predRows, { onConflict: "quiniela_id,fixture_id" })
    if (predUpsertErr) {
      return NextResponse.json({ error: `Error restaurando predictions: ${predUpsertErr.message}` }, { status: 500 })
    }
  }

  // Delete predictions that existed in current state but not in snapshot
  const snapFixtureIds = predRows.map((p: { fixture_id: number }) => p.fixture_id)
  if (snapFixtureIds.length > 0) {
    await admin.from("predictions")
      .delete()
      .eq("quiniela_id", id)
      .not("fixture_id", "in", `(${snapFixtureIds.join(",")})`)
  } else {
    // Snapshot had no predictions — delete all current
    await admin.from("predictions").delete().eq("quiniela_id", id)
  }

  // ── Step 4: restore bracket_picks ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bpRows = (snapData.bracket_picks ?? []).map((bp: any) => ({
    quiniela_id:         id,
    slot_key:            bp.slot_key,
    home_score_pred:     bp.home_score_pred,
    away_score_pred:     bp.away_score_pred,
    predicts_penalties:  Boolean(bp.predicts_penalties),
    penalties_winner:    bp.penalties_winner      ?? null,
    points_earned:       bp.points_earned         ?? 0,
    home_team_id_pred:   bp.home_team_id_pred     ?? null,
    away_team_id_pred:   bp.away_team_id_pred     ?? null,
    home_team_name_pred: bp.home_team_name_pred   ?? null,
    away_team_name_pred: bp.away_team_name_pred   ?? null,
    home_team_flag_pred: bp.home_team_flag_pred   ?? null,
    away_team_flag_pred: bp.away_team_flag_pred   ?? null,
  }))

  if (bpRows.length > 0) {
    const { error: bpUpsertErr } = await admin
      .from("bracket_picks")
      .upsert(bpRows, { onConflict: "quiniela_id,slot_key" })
    if (bpUpsertErr) {
      return NextResponse.json({ error: `Error restaurando bracket_picks: ${bpUpsertErr.message}` }, { status: 500 })
    }
  }

  const snapSlotKeys = bpRows.map((bp: { slot_key: string }) => bp.slot_key)
  if (snapSlotKeys.length > 0) {
    await admin.from("bracket_picks")
      .delete()
      .eq("quiniela_id", id)
      .not("slot_key", "in", `(${snapSlotKeys.map((k: string) => `'${k}'`).join(",")})`)
  } else {
    await admin.from("bracket_picks").delete().eq("quiniela_id", id)
  }

  return NextResponse.json({
    message: `Quiniela restaurada desde snapshot ${snap.snapshot_type} (${new Date(snap.created_at).toLocaleString("es-MX")})`,
    restored_predictions:  predRows.length,
    restored_bracket_picks: bpRows.length,
  })
}
