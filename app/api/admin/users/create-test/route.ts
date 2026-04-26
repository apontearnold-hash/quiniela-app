import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

export async function POST(request: Request) {
  // Admin-only
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const LEGACY_POOL_ID = "00000000-0000-0000-0000-000000000001"

  let body: { email?: string; password?: string; display_name?: string; pool_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const { email, password, display_name, pool_id } = body
  if (!email || !password) {
    return NextResponse.json({ error: "Email y contraseña son requeridos" }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Check for duplicate email
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single()

  if (existing) {
    return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 })
  }

  // Create auth user without email confirmation
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: display_name || email.split("@")[0] },
  })

  if (createErr || !created?.user) {
    return NextResponse.json({ error: createErr?.message ?? "Error al crear usuario" }, { status: 500 })
  }

  const newUser = created.user

  // Upsert profile — approved test user, no invite code needed
  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: newUser.id,
      email: newUser.email,
      display_name: display_name || email.split("@")[0],
      avatar_url: null,
      status: "approved",
      is_test_user: true,
      provider: "email",
      invite_code_used: null,
    },
    { onConflict: "id" }
  )

  if (profileErr) {
    // Clean up orphaned auth user if profile fails
    await admin.auth.admin.deleteUser(newUser.id)
    return NextResponse.json({ error: "Error al crear perfil: " + profileErr.message }, { status: 500 })
  }

  // Add to pool — always add to General, plus the selected pool if different
  const targetPool = pool_id ?? LEGACY_POOL_ID
  await admin.from("pool_members").upsert(
    { pool_id: LEGACY_POOL_ID, user_id: newUser.id, role: "member" },
    { onConflict: "pool_id,user_id" }
  )
  if (targetPool !== LEGACY_POOL_ID) {
    await admin.from("pool_members").upsert(
      { pool_id: targetPool, user_id: newUser.id, role: "member" },
      { onConflict: "pool_id,user_id" }
    )
  }

  return NextResponse.json({
    success: true,
    user: { id: newUser.id, email: newUser.email, display_name: display_name || email.split("@")[0] },
  })
}
