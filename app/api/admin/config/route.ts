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

  const { quiniela_price, currency } = await request.json()
  const price = parseFloat(quiniela_price)
  if (isNaN(price) || price < 0) {
    return NextResponse.json({ error: "Precio inválido" }, { status: 400 })
  }

  const admin = await createAdminClient()
  const { error } = await admin
    .from("tournament_config")
    .upsert({
      id: 1,
      quiniela_price: price,
      currency: currency ?? "USD",
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
