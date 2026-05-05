import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

// POST: bulk-update all bracket_picks for R32 slots with real team data from DB.
// Called automatically when admin enables knockout_editing_open on a pool.
// Only updates team ID/name/flag fields — scores are preserved.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()

  // Fetch canonical R32 slots with current team assignments
  const { data: r32Fixtures, error: fxErr } = await admin
    .from("fixtures")
    .select("bracket_position, home_team_id, home_team_name, home_team_flag, away_team_id, away_team_name, away_team_flag")
    .eq("phase", "round_of_32")
    .not("bracket_position", "is", null)

  if (fxErr) return NextResponse.json({ error: fxErr.message }, { status: 500 })

  const slotMap = new Map<string, {
    home_team_id_pred: number | null
    home_team_name_pred: string | null
    home_team_flag_pred: string | null
    away_team_id_pred: number | null
    away_team_name_pred: string | null
    away_team_flag_pred: string | null
  }>()

  for (const f of r32Fixtures ?? []) {
    if (f.bracket_position) {
      slotMap.set(f.bracket_position, {
        home_team_id_pred:   f.home_team_id,
        home_team_name_pred: f.home_team_name,
        home_team_flag_pred: f.home_team_flag,
        away_team_id_pred:   f.away_team_id,
        away_team_name_pred: f.away_team_name,
        away_team_flag_pred: f.away_team_flag,
      })
    }
  }

  const slotKeys = Array.from(slotMap.keys())
  if (slotKeys.length === 0) {
    return NextResponse.json({ message: "No R32 slots found", updated: 0 })
  }

  const { data: picks, error: pickErr } = await admin
    .from("bracket_picks")
    .select("id, slot_key")
    .in("slot_key", slotKeys)

  if (pickErr) return NextResponse.json({ error: pickErr.message }, { status: 500 })

  if (!picks || picks.length === 0) {
    return NextResponse.json({ message: "No R32 bracket picks to update", updated: 0 })
  }

  const BATCH = 50
  let updated = 0
  for (let i = 0; i < picks.length; i += BATCH) {
    const batch = picks.slice(i, i + BATCH)
    await Promise.all(batch.map(pick => {
      const teams = slotMap.get(pick.slot_key)
      if (!teams) return Promise.resolve()
      return admin.from("bracket_picks").update({
        ...teams,
        updated_at: new Date().toISOString(),
      }).eq("id", pick.id)
    }))
    updated += batch.length
  }

  return NextResponse.json({
    message: `✅ ${updated} bracket picks de R32 actualizados con equipos reales`,
    updated,
  })
}
