import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) return null
  return user
}

// GET — list all invite codes with pool name
export async function GET() {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("invite_codes")
    .select("*, pools(id, name)")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ codes: data ?? [] })
}

// POST — create a new invite code
export async function POST(request: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { code?: string; description?: string; max_uses?: number | null; auto_approve?: boolean; pool_id?: string | null }
  try { body = await request.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const { code, description, max_uses, auto_approve, pool_id } = body
  if (!code?.trim()) return NextResponse.json({ error: "El código es requerido" }, { status: 400 })

  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "")
  if (normalized.length < 4) return NextResponse.json({ error: "El código debe tener al menos 4 caracteres" }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("invite_codes")
    .insert({
      code: normalized,
      description: description?.trim() || null,
      is_active: true,
      max_uses: max_uses ?? null,
      uses_count: 0,
      auto_approve: auto_approve ?? true,
      pool_id: pool_id ?? "00000000-0000-0000-0000-000000000001",
    })
    .select()
    .single()

  if (error) {
    if (error.message.includes("unique") || error.code === "23505") {
      return NextResponse.json({ error: "Este código ya existe" }, { status: 400 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ code: data })
}

// PATCH — update a code (toggle active, set max_uses, set auto_approve)
export async function PATCH(request: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { id?: string; is_active?: boolean; max_uses?: number | null; auto_approve?: boolean; description?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

  const allowed = ["is_active", "max_uses", "auto_approve", "description"]
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in rest) update[key] = (rest as Record<string, unknown>)[key]
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from("invite_codes").update(update).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// DELETE — delete a code (only if uses_count = 0)
export async function DELETE(request: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const { id } = body
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

  const admin = createAdminClient()
  const { data: existing } = await admin.from("invite_codes").select("uses_count, code").eq("id", id).single()

  if (!existing) return NextResponse.json({ error: "Código no encontrado" }, { status: 404 })
  if (existing.uses_count > 0) {
    return NextResponse.json({ error: `No se puede eliminar: el código ha sido usado ${existing.uses_count} vez/veces` }, { status: 400 })
  }

  const { error } = await admin.from("invite_codes").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
