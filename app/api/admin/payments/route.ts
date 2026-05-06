import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) return null
  return user
}

// GET /api/admin/payments?pool_id=X
// Returns all pool members with their submitted quiniela count and payment status.
export async function GET(req: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const poolId = new URL(req.url).searchParams.get("pool_id")
  if (!poolId) return NextResponse.json({ error: "pool_id requerido" }, { status: 400 })

  const admin = createAdminClient()

  const [
    { data: pool },
    { data: members },
    { data: submittedQ },
    { data: payments },
  ] = await Promise.all([
    admin.from("pools").select("name, price_per_quiniela, currency").eq("id", poolId).single(),
    admin.from("pool_members").select("user_id, profiles(email, display_name)").eq("pool_id", poolId),
    admin.from("quinielas").select("user_id").eq("pool_id", poolId).eq("status", "submitted").eq("is_test", false),
    admin.from("pool_payments").select("*").eq("pool_id", poolId),
  ])

  if (!pool) return NextResponse.json({ error: "Liga no encontrada" }, { status: 404 })

  const countMap: Record<string, number> = {}
  for (const q of submittedQ ?? []) {
    countMap[q.user_id] = (countMap[q.user_id] ?? 0) + 1
  }

  const paymentMap: Record<string, { id: string; amount_paid: number; notes: string | null }> = {}
  for (const p of payments ?? []) {
    paymentMap[p.user_id] = { id: p.id, amount_paid: Number(p.amount_paid), notes: p.notes }
  }

  const price = pool.price_per_quiniela ?? 0

  const rows = (members ?? []).map(m => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = m.profiles as any
    const count      = countMap[m.user_id] ?? 0
    const totalDue   = count * price
    const amountPaid = paymentMap[m.user_id]?.amount_paid ?? 0
    const pending    = Math.max(0, totalDue - amountPaid)
    return {
      user_id:      m.user_id,
      email:        profile?.email        ?? "—",
      display_name: profile?.display_name ?? null,
      quiniela_count: count,
      total_due:    totalDue,
      amount_paid:  amountPaid,
      pending,
      notes:        paymentMap[m.user_id]?.notes ?? null,
      currency:     pool.currency,
    }
  }).sort((a, b) => b.pending - a.pending || b.total_due - a.total_due)

  return NextResponse.json({ pool: { name: pool.name, price_per_quiniela: price, currency: pool.currency }, rows })
}

// PATCH /api/admin/payments
// Body: { pool_id, user_id, amount_paid, notes? }
// Upserts a payment record (admin only).
export async function PATCH(req: Request) {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { pool_id, user_id, amount_paid, notes } = body

  if (!pool_id || !user_id) return NextResponse.json({ error: "pool_id y user_id requeridos" }, { status: 400 })
  const paid = parseFloat(amount_paid)
  if (isNaN(paid) || paid < 0) return NextResponse.json({ error: "amount_paid inválido" }, { status: 400 })

  const admin = createAdminClient()

  // Fetch pool currency
  const { data: pool } = await admin.from("pools").select("currency").eq("id", pool_id).single()

  const { error } = await admin.from("pool_payments").upsert({
    pool_id,
    user_id,
    amount_paid: paid,
    currency:    pool?.currency ?? "USD",
    notes:       notes ?? null,
    updated_at:  new Date().toISOString(),
    updated_by:  user.id,
  }, { onConflict: "pool_id,user_id" })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
