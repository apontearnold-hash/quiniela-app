import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

// DELETE /api/quiniela/[id]
// Deletes a draft quiniela and all its associated data.
// Submitted quinielas cannot be deleted.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()

  const { data: quiniela } = await admin
    .from("quinielas")
    .select("user_id, status")
    .eq("id", id)
    .single()

  if (!quiniela) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (quiniela.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (quiniela.status === "submitted") {
    return NextResponse.json({ error: "No se puede borrar una quiniela ya enviada" }, { status: 403 })
  }

  // Delete child rows first, then the quiniela
  await Promise.all([
    admin.from("predictions").delete().eq("quiniela_id", id),
    admin.from("bracket_picks").delete().eq("quiniela_id", id),
  ])

  const { error } = await admin.from("quinielas").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
