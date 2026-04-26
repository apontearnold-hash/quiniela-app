import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase-server"

// Lightweight invite code check — used before triggering Google OAuth
export async function POST(request: Request) {
  let body: { invite_code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
  }

  const { invite_code } = body
  if (!invite_code?.trim()) {
    return NextResponse.json({ error: "Código requerido" }, { status: 400 })
  }

  const admin = createAdminClient()
  const code = invite_code.trim().toUpperCase()

  const { data } = await admin
    .from("invite_codes")
    .select("is_active, max_uses, uses_count, auto_approve")
    .eq("code", code)
    .single()

  if (!data) return NextResponse.json({ error: "Código de invitación inválido" }, { status: 400 })
  if (!data.is_active) return NextResponse.json({ error: "Este código no está activo" }, { status: 400 })
  if (data.max_uses !== null && data.uses_count >= data.max_uses) {
    return NextResponse.json({ error: "Este código ha alcanzado su límite de usos" }, { status: 400 })
  }

  return NextResponse.json({ valid: true, auto_approve: data.auto_approve })
}
