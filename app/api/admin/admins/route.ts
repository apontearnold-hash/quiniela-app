import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

const PRIMARY_ADMIN = "apontearnold@gmail.com"

async function isAdmin(supabase: Awaited<ReturnType<typeof createClient>>, email: string | null | undefined) {
  if (!email) return false
  const { data } = await supabase.from("admins").select("email").eq("email", email).single()
  return !!data
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isAdmin(supabase, user.email))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = await createAdminClient()
  const { data, error } = await admin.from("admins").select("id, email, created_at").order("created_at")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ admins: data })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isAdmin(supabase, user.email))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { email } = await request.json()
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 })
  }

  const admin = await createAdminClient()
  const { error } = await admin.from("admins").insert({ email: email.trim().toLowerCase() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !(await isAdmin(supabase, user.email))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { email } = await request.json()
  if (email === PRIMARY_ADMIN) {
    return NextResponse.json({ error: "No se puede eliminar el admin principal" }, { status: 403 })
  }

  const admin = await createAdminClient()
  const { error } = await admin.from("admins").delete().eq("email", email)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
