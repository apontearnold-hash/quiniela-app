import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("tournament_config")
    .select("*")
    .eq("id", 1)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { quiniela_price, currency, lock_date } = await request.json()
  const price = parseFloat(quiniela_price)
  if (isNaN(price) || price < 0) {
    return NextResponse.json({ error: "Precio inválido" }, { status: 400 })
  }

  // lock_date must be a valid ISO string or null/undefined
  const resolvedLockDate: string | null =
    lock_date === null || lock_date === "" ? null
    : lock_date ? new Date(lock_date).toISOString()
    : undefined as unknown as null  // omit if not provided

  const admin = await createAdminClient()
  const upsertPayload: Record<string, unknown> = {
    id: 1,
    quiniela_price: price,
    currency: currency ?? "USD",
    updated_at: new Date().toISOString(),
  }
  if (lock_date !== undefined) upsertPayload.lock_date = resolvedLockDate

  const { error } = await admin
    .from("tournament_config")
    .upsert(upsertPayload, { onConflict: "id" })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
