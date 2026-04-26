import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase-server"

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request) {
  let body: { email?: string; password?: string; name?: string; invite_code?: string }
  try {
    body = await request.json()
  } catch {
    return err(400, "Datos inválidos")
  }

  const { email, password, name, invite_code } = body

  if (!email || !password || !name || !invite_code) {
    return err(400, "Todos los campos son requeridos")
  }
  if (password.length < 6) {
    return err(400, "La contraseña debe tener al menos 6 caracteres")
  }

  const admin = createAdminClient()
  const code = invite_code.trim().toUpperCase()
  const cleanEmail = email.trim().toLowerCase()
  const cleanName = name.trim()

  // ── 1. Validate invite code ──────────────────────────────────────────────
  const { data: inviteRow } = await admin
    .from("invite_codes")
    .select("id, is_active, max_uses, uses_count, auto_approve, pool_id")
    .eq("code", code)
    .single()

  if (!inviteRow) return err(400, "Código de invitación inválido")
  if (!inviteRow.is_active) return err(400, "Este código no está activo")
  if (inviteRow.max_uses !== null && inviteRow.uses_count >= inviteRow.max_uses) {
    return err(400, "Este código ha alcanzado su límite de usos")
  }

  // ── 2. Create auth user ──────────────────────────────────────────────────
  // email_confirm: true — user is immediately active, no email verification needed.
  // This app is private/invite-only; the invite code itself is the trust gate.
  const { data: newUserData, error: createErr } = await admin.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
    user_metadata: { full_name: cleanName },
  })

  if (createErr) {
    const msg = createErr.message.toLowerCase()
    if (msg.includes("already registered") || msg.includes("already been registered")) {
      return err(400, "Este correo ya está registrado")
    }
    return err(400, createErr.message)
  }

  const userId = newUserData.user.id
  const status = inviteRow.auto_approve ? "approved" : "pending"

  // ── 3. Set up profile + pool membership ─────────────────────────────────
  await admin.from("profiles").upsert(
    {
      id: userId,
      email: cleanEmail,
      display_name: cleanName,
      status,
      invite_code_used: code,
      is_test_user: false,
      provider: "email",
    },
    { onConflict: "id" }
  )

  await admin.rpc("increment_invite_uses", { code_id: inviteRow.id })

  if (inviteRow.pool_id) {
    await admin.from("pool_members").upsert(
      { pool_id: inviteRow.pool_id, user_id: userId, role: "member" },
      { onConflict: "pool_id,user_id" }
    )
  }

  return NextResponse.json({ ok: true, status })
}
