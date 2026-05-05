import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import {
  recalculateGroupStandings,
  fillGroupAdvancers,
  assignBest3rd,
  advanceKnockout,
} from "@/lib/bracket"

export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const admin = await createAdminClient()

    // Pre-validation: all 72 group games must be finished before running the pipeline.
    // fillGroupAdvancers has its own internal guard but we return early here for a
    // clear admin-facing message.
    const { count: finishedCount, error: countErr } = await admin
      .from("fixtures")
      .select("id", { count: "exact", head: true })
      .eq("phase", "groups")
      .eq("status", "finished")
      .not("home_score", "is", null)

    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })

    if ((finishedCount ?? 0) < 72) {
      return NextResponse.json({
        message: `⏳ Grupos incompletos — ${finishedCount ?? 0}/72 partidos terminados. El bracket de R32 se actualizará cuando termine la fase de grupos.`,
        groupsFinished: finishedCount ?? 0,
        groupsRequired: 72,
      })
    }

    const standings = await recalculateGroupStandings(admin)
    const groupFilled = await fillGroupAdvancers(admin, standings)
    const best3rdFilled = await assignBest3rd(admin, standings)
    const knockoutAdvanced = await advanceKnockout(admin)

    const total = groupFilled + best3rdFilled + knockoutAdvanced
    return NextResponse.json({
      message: `✅ Bracket actualizado: ${groupFilled} clasificados de grupo, ${best3rdFilled} mejores 3ros, ${knockoutAdvanced} avances en eliminatoria`,
      groupFilled,
      best3rdFilled,
      knockoutAdvanced,
      total,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
