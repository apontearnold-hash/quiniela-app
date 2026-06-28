import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) return null
  return user
}

// GET — list quinielas for a pool with their carryover_points
export async function GET(request: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const pool_id = searchParams.get("pool_id")
  if (!pool_id) return NextResponse.json({ error: "pool_id requerido" }, { status: 400 })

  const admin = createAdminClient()

  const { data: pool, error: pErr } = await admin
    .from("pools")
    .select("allow_carryover_points, start_phase")
    .eq("id", pool_id)
    .single()

  if (pErr || !pool) return NextResponse.json({ error: "Liga no encontrada" }, { status: 404 })
  if (!pool.allow_carryover_points) return NextResponse.json({ error: "Esta liga no tiene carryover habilitado" }, { status: 400 })

  const { data: quinielas, error: qErr } = await admin
    .from("quinielas")
    .select("id, name, carryover_points, profiles(display_name, email)")
    .eq("pool_id", pool_id)
    .order("created_at", { ascending: true })

  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  return NextResponse.json({ quinielas: quinielas ?? [] })
}

// PATCH — set carryover_points on a quiniela (only if pool has allow_carryover_points)
export async function PATCH(request: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: { quiniela_id?: string; carryover_points?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }) }

  const { quiniela_id, carryover_points } = body
  if (!quiniela_id) return NextResponse.json({ error: "quiniela_id requerido" }, { status: 400 })
  if (carryover_points === undefined || carryover_points < 0) {
    return NextResponse.json({ error: "carryover_points debe ser un número >= 0" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify the quiniela belongs to a pool with allow_carryover_points
  const { data: q, error: qErr } = await admin
    .from("quinielas")
    .select("id, pool_id, pools(allow_carryover_points)")
    .eq("id", quiniela_id)
    .single()

  if (qErr || !q) return NextResponse.json({ error: "Quiniela no encontrada" }, { status: 404 })

  const poolSettings = q.pools as unknown as { allow_carryover_points: boolean } | null
  if (!poolSettings?.allow_carryover_points) {
    return NextResponse.json({ error: "La liga de esta quiniela no tiene carryover habilitado" }, { status: 400 })
  }

  const { error: uErr } = await admin
    .from("quinielas")
    .update({ carryover_points, updated_at: new Date().toISOString() })
    .eq("id", quiniela_id)

  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
