import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

// POST /api/quiniela/[id]/sync-r32
// Updates ONLY the R32 bracket_picks for this quiniela with real team assignments
// from the fixtures table. Preserves all scores. Clears champion_team_name so the
// dashboard re-derives it from updated picks.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()

  // Verify ownership
  const { data: quiniela } = await admin
    .from("quinielas")
    .select("user_id, pool_id")
    .eq("id", id)
    .single()

  if (!quiniela) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (quiniela.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Verify pool has knockout editing open
  if (quiniela.pool_id) {
    const { data: pool } = await admin
      .from("pools")
      .select("knockout_editing_open")
      .eq("id", quiniela.pool_id)
      .single()

    if (!pool?.knockout_editing_open) {
      return NextResponse.json({ error: "Edición de eliminatorias no habilitada en esta liga" }, { status: 403 })
    }
  }

  // Fetch R32 fixtures with real team assignments
  const { data: r32Fixtures, error: fxErr } = await admin
    .from("fixtures")
    .select("bracket_position, home_team_id, home_team_name, home_team_flag, away_team_id, away_team_name, away_team_flag")
    .eq("phase", "round_of_32")
    .not("bracket_position", "is", null)
    .not("home_team_id", "is", null)

  if (fxErr) return NextResponse.json({ error: fxErr.message }, { status: 500 })
  if (!r32Fixtures || r32Fixtures.length === 0) {
    return NextResponse.json({ error: "Aún no hay equipos reales asignados a R32" }, { status: 400 })
  }

  const slotMap = new Map<string, {
    home_team_id_pred:   number | null
    home_team_name_pred: string | null
    home_team_flag_pred: string | null
    away_team_id_pred:   number | null
    away_team_name_pred: string | null
    away_team_flag_pred: string | null
  }>()
  for (const f of r32Fixtures) {
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

  // Fetch this quiniela's existing R32 bracket_picks
  const slotKeys = Array.from(slotMap.keys())
  const { data: picks, error: pickErr } = await admin
    .from("bracket_picks")
    .select("id, slot_key")
    .eq("quiniela_id", id)
    .in("slot_key", slotKeys)

  if (pickErr) return NextResponse.json({ error: pickErr.message }, { status: 500 })

  // Update team fields only — scores untouched
  let updated = 0
  if (picks && picks.length > 0) {
    await Promise.all(picks.map(pick => {
      const teams = slotMap.get(pick.slot_key)
      if (!teams) return Promise.resolve()
      return admin.from("bracket_picks").update({
        ...teams,
        updated_at: new Date().toISOString(),
      }).eq("id", pick.id)
    }))
    updated = picks.length
  }

  // Mark quiniela as synced + clear stale champion (dashboard will re-derive it)
  await admin.from("quinielas").update({
    r32_synced_at:      new Date().toISOString(),
    champion_team_name: null,
    champion_team_flag: null,
  }).eq("id", id)

  return NextResponse.json({
    message: `✅ ${updated} picks de R32 actualizados con equipos reales`,
    updated,
  })
}
