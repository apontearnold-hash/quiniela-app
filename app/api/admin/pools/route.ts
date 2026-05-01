import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) return null
  return user
}

// GET — list all pools with member count
export async function GET() {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()

  const { data: pools, error } = await admin
    .from("pools")
    .select("*")
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Member counts per pool
  const { data: members } = await admin.from("pool_members").select("pool_id")
  const memberCounts: Record<string, number> = {}
  for (const m of members ?? []) {
    memberCounts[m.pool_id] = (memberCounts[m.pool_id] ?? 0) + 1
  }

  // Quiniela counts per pool
  const { data: quinielas } = await admin.from("quinielas").select("pool_id")
  const quinielaCounts: Record<string, number> = {}
  for (const q of quinielas ?? []) {
    if (q.pool_id) quinielaCounts[q.pool_id] = (quinielaCounts[q.pool_id] ?? 0) + 1
  }

  const result = (pools ?? []).map(p => ({
    ...p,
    member_count: memberCounts[p.id] ?? 0,
    quiniela_count: quinielaCounts[p.id] ?? 0,
  }))

  return NextResponse.json({ pools: result })
}

// POST — create a new pool
export async function POST(request: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { name?: string; description?: string; price_per_quiniela?: number; currency?: string; prize_type?: string; prize_description?: string; prize_1st?: string; prize_2nd?: string; prize_3rd?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const { name, description, price_per_quiniela, currency, prize_type, prize_description, prize_1st, prize_2nd, prize_3rd } = body
  if (!name?.trim()) return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 })

  const admin = createAdminClient()

  const { data, error } = await admin.from("pools").insert({
    name: name.trim(),
    description: description?.trim() || null,
    price_per_quiniela: price_per_quiniela ?? 5.00,
    currency: currency ?? "USD",
    prize_type: prize_type === "physical" ? "physical" : "money",
    prize_description: prize_description?.trim() || null,
    prize_1st: prize_1st?.trim() || null,
    prize_2nd: prize_2nd?.trim() || null,
    prize_3rd: prize_3rd?.trim() || null,
    created_by: user.id,
    is_active: true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ pool: data })
}

// PATCH — update a pool
export async function PATCH(request: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { id?: string; name?: string; description?: string; price_per_quiniela?: number; currency?: string; is_active?: boolean; knockout_editing_open?: boolean; prize_type?: string; prize_description?: string; prize_1st?: string; prize_2nd?: string; prize_3rd?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const { id, ...rest } = body
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })

  const allowed = ["name", "description", "price_per_quiniela", "currency", "is_active", "knockout_editing_open", "prize_type", "prize_description", "prize_1st", "prize_2nd", "prize_3rd"]
  const update: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in rest) update[key] = (rest as Record<string, unknown>)[key]
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from("pools").update(update).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

// DELETE — delete a pool (only if no quinielas)
export async function DELETE(request: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { id?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const { id } = body
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 })
  if (id === "00000000-0000-0000-0000-000000000001") {
    return NextResponse.json({ error: "No se puede eliminar la liga principal" }, { status: 400 })
  }

  const admin = createAdminClient()

  const { count } = await admin.from("quinielas").select("*", { count: "exact", head: true }).eq("pool_id", id)
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `No se puede eliminar: la liga tiene ${count} quiniela(s)` }, { status: 400 })
  }

  const { error } = await admin.from("pools").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
