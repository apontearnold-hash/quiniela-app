/**
 * POST /api/admin/backfill-champions
 * One-time operation: derives and saves champion_team_name / champion_team_flag
 * for every submitted quiniela that doesn't have them yet, based purely on
 * each user's own bracket picks (no real results).
 */
import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import { deriveChampions } from "@/lib/derive-champion"
import type { Fixture } from "@/lib/types"

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()

  // All submitted quinielas missing a champion
  const { data: quinielasRaw, error: qErr } = await admin
    .from("quinielas")
    .select("id")
    .eq("status", "submitted")
    .is("champion_team_name", null)

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  if (!quinielasRaw || quinielasRaw.length === 0) {
    return NextResponse.json({ message: "Nothing to backfill.", updated: 0 })
  }

  const quinielaIds = quinielasRaw.map(q => q.id)

  // Fetch group fixtures + picks for all target quinielas in parallel
  const [{ data: gFixtures }, { data: dPreds }, { data: dBpicks }] = await Promise.all([
    admin.from("fixtures").select("*").eq("phase", "groups"),
    admin.from("predictions")
      .select("quiniela_id, fixture_id, home_score_pred, away_score_pred, predicts_penalties, penalties_winner")
      .in("quiniela_id", quinielaIds),
    admin.from("bracket_picks")
      .select("quiniela_id, slot_key, home_score_pred, away_score_pred, predicts_penalties, penalties_winner")
      .in("quiniela_id", quinielaIds),
  ])

  const derivedMap = deriveChampions(
    quinielaIds,
    (gFixtures ?? []) as Fixture[],
    (dPreds ?? []) as Parameters<typeof deriveChampions>[2],
    (dBpicks ?? []) as Parameters<typeof deriveChampions>[3],
  )

  if (derivedMap.size === 0) {
    return NextResponse.json({ message: "No champions could be derived (FIN picks may be missing).", updated: 0 })
  }

  // Batch-update quinielas
  let updated = 0
  const updates = Array.from(derivedMap.entries()).map(([id, { name, flag }]) =>
    admin.from("quinielas").update({ champion_team_name: name, champion_team_flag: flag }).eq("id", id)
  )

  const results = await Promise.all(updates)
  updated = results.filter(r => !r.error).length
  const errors = results.filter(r => r.error).map(r => r.error!.message)

  return NextResponse.json({
    message: `✅ Backfilled ${updated} / ${derivedMap.size} quinielas.`,
    updated,
    errors: errors.length > 0 ? errors : undefined,
  })
}
