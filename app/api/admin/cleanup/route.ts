/**
 * POST /api/admin/cleanup
 * Deletes all test quinielas (is_test = true) and their predictions.
 * Uses service role to bypass RLS.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-server"

export async function POST() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = await createAdminClient()

  // Fetch test quiniela IDs first
  const { data: testQuinielas, error: qErr } = await admin
    .from("quinielas")
    .select("id")
    .eq("is_test", true)

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  if (!testQuinielas || testQuinielas.length === 0) {
    return NextResponse.json({ message: "No hay quinielas de prueba que eliminar", deleted: 0 })
  }

  const ids = testQuinielas.map((q: { id: string }) => q.id)

  // Delete predictions first (FK constraint)
  const { error: pErr } = await admin
    .from("predictions")
    .delete()
    .in("quiniela_id", ids)

  if (pErr) return NextResponse.json({ error: `Predictions: ${pErr.message}` }, { status: 500 })

  // Delete quinielas
  const { error: dErr } = await admin
    .from("quinielas")
    .delete()
    .eq("is_test", true)

  if (dErr) return NextResponse.json({ error: `Quinielas: ${dErr.message}` }, { status: 500 })

  return NextResponse.json({
    message: `🗑️ ${ids.length} quinielas de prueba eliminadas`,
    deleted: ids.length,
  })
}
