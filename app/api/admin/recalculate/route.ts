import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import {
  recalculateGroupStandings,
  fillGroupAdvancers,
  assignBest3rd,
  advanceKnockout,
} from "@/lib/bracket"
import { recalculateAllPoints } from "@/lib/recalculate"

// Full pipeline — same sequence as saving a result.
// Used as a maintenance/recovery tool when points are out of sync
// (e.g. after manual DB edits or data migrations).
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const standings = await recalculateGroupStandings(admin)
    await fillGroupAdvancers(admin, standings)
    await assignBest3rd(admin, standings)
    await advanceKnockout(admin)
    const { predictions, quinielas } = await recalculateAllPoints(admin)
    return NextResponse.json({
      message: `Recalculado: ${predictions} predicciones en ${quinielas} quinielas`,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
