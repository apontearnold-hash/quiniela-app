import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import { BRACKET_SLOTS } from "@/lib/bracket-slots"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Use admin client so RLS never hides the owner's own quiniela
  const admin = createAdminClient()

  const { data: quiniela } = await admin
    .from("quinielas")
    .select("id, user_id, status, top_scorer_pick, most_goals_team_pick")
    .eq("id", id)
    .single()

  if (!quiniela)                    return NextResponse.json({ error: "Not found" },    { status: 404 })
  if (quiniela.user_id !== user.id) return NextResponse.json({ error: "Forbidden" },   { status: 403 })
  if (quiniela.status === "submitted") {
    return NextResponse.json({ error: "Ya fue enviada" }, { status: 400 })
  }

  // Lock date check — drafts cannot be submitted after the deadline
  const [lockCfgRes, firstKickoffRes] = await Promise.all([
    admin.from("tournament_config").select("lock_date").eq("id", 1).maybeSingle(),
    admin.from("fixtures").select("kickoff").eq("phase", "groups").not("kickoff", "is", null).order("kickoff", { ascending: true }).limit(1).maybeSingle(),
  ])
  let lockDate: string | null = (lockCfgRes.data?.lock_date as string | null) ?? null
  if (!lockDate) {
    const k = firstKickoffRes.data?.kickoff as string | null | undefined
    if (k) lockDate = new Date(new Date(k).toDateString()).toISOString()
  }
  if (lockDate && Date.now() >= new Date(lockDate).getTime()) {
    return NextResponse.json({ error: "El cierre de quinielas ya pasó" }, { status: 403 })
  }

  const [
    { count: groupTotal },
    { count: predsFilled },
    { data: bpicks },
  ] = await Promise.all([
    admin
      .from("fixtures")
      .select("id", { count: "exact", head: true })
      .eq("phase", "groups"),
    admin
      .from("predictions")
      .select("id", { count: "exact", head: true })
      .eq("quiniela_id", id)
      .not("home_score_pred", "is", null)
      .not("away_score_pred", "is", null),
    admin
      .from("bracket_picks")
      .select("slot_key, home_score_pred, away_score_pred, predicts_penalties, penalties_winner")
      .eq("quiniela_id", id),
  ])

  const missing: string[] = []

  // 1. All group-stage matches filled
  const gTotal  = groupTotal  ?? 0
  const gFilled = predsFilled ?? 0
  if (gTotal > 0 && gFilled < gTotal) {
    const n = gTotal - gFilled
    missing.push(`${n} partido${n > 1 ? "s" : ""} de grupos sin completar`)
  }

  // 2. All 32 knockout bracket slots filled
  const bracketTotal  = BRACKET_SLOTS.length
  const filledBpicks  = (bpicks ?? []).filter(bp => bp.home_score_pred != null && bp.away_score_pred != null)
  if (filledBpicks.length < bracketTotal) {
    const n = bracketTotal - filledBpicks.length
    missing.push(`${n} partido${n > 1 ? "s" : ""} de eliminatoria sin completar`)
  }

  // 3. No knockout ties without a declared penalty winner
  const badTies = filledBpicks.filter(
    bp => bp.home_score_pred === bp.away_score_pred && !bp.penalties_winner
  ).length
  if (badTies > 0) {
    missing.push(`${badTies} empate${badTies > 1 ? "s" : ""} en eliminatoria sin definir penales`)
  }

  // 4 & 5. Bonus picks
  if (!quiniela.top_scorer_pick)    missing.push("Goleador del torneo (bonus)")
  if (!quiniela.most_goals_team_pick) missing.push("Equipo con más goles (bonus)")

  if (missing.length > 0) {
    const list = missing.map(m => `· ${m}`).join(", ")
    return NextResponse.json({
      error: `No puedes enviar la quiniela todavía. Faltan: ${list}. Puedes guardarla como borrador.`,
      missing,
    }, { status: 400 })
  }

  // ── Mark as submitted ─────────────────────────────────────────────────────────
  // Admin client required: RLS blocks UPDATE even for the owner in SSR context.
  // Ownership was already verified above (quiniela.user_id === user.id).
  const { error } = await admin
    .from("quinielas")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
