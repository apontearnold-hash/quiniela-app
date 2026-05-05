import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

// GET /api/admin/quinielas/[id]/snapshots
// Lists all snapshots for a quiniela, newest first.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: snapshots, error } = await admin
    .from("quiniela_snapshots")
    .select("id, snapshot_type, created_at, created_by, notes")
    .eq("quiniela_id", id)
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ snapshots: snapshots ?? [] })
}
