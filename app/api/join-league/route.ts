import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : ""
  if (!code) return NextResponse.json({ error: "missing_code" }, { status: 400 })

  const admin = createAdminClient()

  // 1. Validate invite code
  const { data: invite } = await admin
    .from("invite_codes")
    .select("id, pool_id, is_active, max_uses, uses_count, pools(id, name, is_active)")
    .eq("code", code)
    .maybeSingle()

  if (!invite) return NextResponse.json({ error: "invalid_code" }, { status: 404 })
  if (!invite.is_active) return NextResponse.json({ error: "inactive_code" }, { status: 400 })
  if (invite.max_uses !== null && invite.uses_count >= invite.max_uses) {
    return NextResponse.json({ error: "code_exhausted" }, { status: 400 })
  }

  const pool = invite.pools as unknown as { id: string; name: string; is_active: boolean } | null
  if (!pool || !pool.is_active) return NextResponse.json({ error: "inactive_league" }, { status: 400 })

  // 2. Check if already a member
  const { data: existing } = await admin
    .from("pool_members")
    .select("id")
    .eq("pool_id", pool.id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: "already_member", pool: { id: pool.id, name: pool.name } }, { status: 409 })
  }

  // 3. Add to pool
  const { error: insertError } = await admin
    .from("pool_members")
    .insert({ pool_id: pool.id, user_id: user.id, role: "member" })

  if (insertError) {
    console.error("[join-league] insert failed:", insertError)
    return NextResponse.json({ error: "join_failed" }, { status: 500 })
  }

  // 4. Increment uses_count atomically
  await admin
    .from("invite_codes")
    .update({ uses_count: invite.uses_count + 1 })
    .eq("id", invite.id)

  return NextResponse.json({ pool: { id: pool.id, name: pool.name } })
}
