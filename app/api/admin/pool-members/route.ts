import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

const LEGACY_POOL_ID = "00000000-0000-0000-0000-000000000001"

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) return null
  return user
}

export async function POST(request: Request) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  let body: { user_id?: string; pool_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const { user_id, pool_id } = body
  if (!user_id || !pool_id) {
    return NextResponse.json({ error: "user_id y pool_id son requeridos" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from("pool_members").upsert(
    { pool_id, user_id, role: "member" },
    { onConflict: "pool_id,user_id" }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  let body: { user_id?: string; pool_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const { user_id, pool_id } = body
  if (!user_id || !pool_id) {
    return NextResponse.json({ error: "user_id y pool_id son requeridos" }, { status: 400 })
  }

  // Prevent removing from General pool — it's the fallback
  if (pool_id === LEGACY_POOL_ID) {
    return NextResponse.json({ error: "No se puede remover de la liga General" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("pool_members")
    .delete()
    .eq("pool_id", pool_id)
    .eq("user_id", user_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
