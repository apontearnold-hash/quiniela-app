import { createAdminClient } from "@/lib/supabase-server"

export type SnapshotType =
  | "initial_submit"
  | "before_r32_sync"
  | "after_r32_submit"
  | "manual_backup"
  | "restore_point"

/**
 * Creates a frozen copy of a quiniela (header + predictions + bracket_picks) in quiniela_snapshots.
 * Errors are thrown — callers that want non-fatal behavior should wrap in try/catch.
 */
export async function createQuinielaSnapshot(
  quinielaId: string,
  snapshotType: SnapshotType,
  options?: { createdBy?: string; notes?: string }
): Promise<string> {
  const admin = createAdminClient()

  const [
    { data: quiniela },
    { data: predictions },
    { data: bracketPicks },
  ] = await Promise.all([
    admin.from("quinielas").select("*").eq("id", quinielaId).single(),
    admin.from("predictions").select("*").eq("quiniela_id", quinielaId),
    admin.from("bracket_picks").select("*").eq("quiniela_id", quinielaId),
  ])

  if (!quiniela) throw new Error(`Quiniela ${quinielaId} not found`)

  const snapshotData = {
    quiniela: {
      id:                    quiniela.id,
      user_id:               quiniela.user_id,
      pool_id:               quiniela.pool_id,
      name:                  quiniela.name,
      status:                quiniela.status,
      submitted_at:          quiniela.submitted_at,
      r32_synced_at:         quiniela.r32_synced_at,
      top_scorer_pick:       quiniela.top_scorer_pick,
      top_scorer_player_id:  quiniela.top_scorer_player_id,
      most_goals_team_pick:  quiniela.most_goals_team_pick,
      most_goals_team_id:    quiniela.most_goals_team_id,
      top_scorer_points:     quiniela.top_scorer_points,
      most_goals_team_points: quiniela.most_goals_team_points,
      champion_team_name:    quiniela.champion_team_name,
      champion_team_flag:    quiniela.champion_team_flag,
      total_points:          quiniela.total_points,
      exact_results:         quiniela.exact_results,
      correct_winners:       quiniela.correct_winners,
    },
    predictions:   predictions   ?? [],
    bracket_picks: bracketPicks  ?? [],
    captured_at:   new Date().toISOString(),
  }

  const { data: snapshot, error } = await admin
    .from("quiniela_snapshots")
    .insert({
      quiniela_id:   quinielaId,
      user_id:       quiniela.user_id,
      pool_id:       quiniela.pool_id ?? null,
      snapshot_type: snapshotType,
      snapshot_data: snapshotData,
      created_by:    options?.createdBy ?? null,
      notes:         options?.notes     ?? null,
    })
    .select("id")
    .single()

  if (error) throw new Error(`Failed to create snapshot: ${error.message}`)
  return snapshot!.id
}
