import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) return null
  return user
}

// GET — list all users with profile data + quiniela count
export async function GET() {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, email, display_name, status, invite_code_used, is_test_user, provider, created_at")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get quiniela counts per user
  const { data: counts } = await admin
    .from("quinielas")
    .select("user_id")

  const quinielaCounts: Record<string, number> = {}
  for (const q of counts ?? []) {
    quinielaCounts[q.user_id] = (quinielaCounts[q.user_id] ?? 0) + 1
  }

  const result = (profiles ?? []).map(p => ({
    ...p,
    quiniela_count: quinielaCounts[p.id] ?? 0,
  }))

  return NextResponse.json({ users: result })
}

// PATCH — update user status or is_test_user flag
export async function PATCH(request: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { user_id?: string; status?: string; is_test_user?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const { user_id, status, is_test_user } = body
  if (!user_id) return NextResponse.json({ error: "user_id requerido" }, { status: 400 })

  const admin = createAdminClient()

  // Protect the principal admin from being blocked or demoted
  const { data: targetProfile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", user_id)
    .single()

  if (
    targetProfile?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL &&
    status !== undefined &&
    status !== "approved"
  ) {
    return NextResponse.json({ error: "No puedes cambiar el estado del administrador principal" }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (status !== undefined) {
    if (!["pending", "approved", "blocked"].includes(status)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 })
    }
    update.status = status
  }
  if (is_test_user !== undefined) update.is_test_user = is_test_user

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 })
  }

  const { error } = await admin.from("profiles").update(update).eq("id", user_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// DELETE — delete a user (test users only for safety, or forced=true for any)
export async function DELETE(request: Request) {
  const adminUser = await verifyAdmin()
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { user_id?: string; force?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const { user_id, force } = body
  if (!user_id) return NextResponse.json({ error: "user_id requerido" }, { status: 400 })

  // Prevent deleting the main admin
  const admin = createAdminClient()
  const { data: profile } = await admin.from("profiles").select("email, is_test_user").eq("id", user_id).single()

  if (profile?.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "No puedes eliminar al administrador principal" }, { status: 400 })
  }
  if (!force && !profile?.is_test_user) {
    return NextResponse.json({ error: "Solo se pueden eliminar usuarios de prueba. Usa force=true para eliminar cualquier usuario." }, { status: 400 })
  }

  // Delete predictions → quinielas → profile → auth user (cascade handles profile)
  const { data: quinielas } = await admin.from("quinielas").select("id").eq("user_id", user_id)
  const qIds = (quinielas ?? []).map(q => q.id)
  if (qIds.length > 0) {
    await admin.from("predictions").delete().in("quiniela_id", qIds)
    await admin.from("quinielas").delete().in("id", qIds)
  }

  const { error: delErr } = await admin.auth.admin.deleteUser(user_id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ success: true, deleted_quinielas: qIds.length })
}
