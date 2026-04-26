import { createClient, createAdminClient } from "@/lib/supabase-server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const inviteCode = searchParams.get("invite_code")?.trim().toUpperCase() ?? null
  const next = searchParams.get("next") ?? "/dashboard"

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.session?.user) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const user = data.session.user
  const admin = createAdminClient()

  // KEY LOGIC:
  // invite_code present in URL  → this was triggered from the Register tab → registration flow
  // invite_code absent from URL → this was triggered from the Login tab    → login flow
  //
  // For login: just redirect. The middleware enforces pending/blocked status.
  // For registration: validate invite code and set up the profile.

  if (inviteCode) {
    // ── REGISTRATION FLOW ────────────────────────────────────────────
    // Check if this user already has a processed profile (e.g. somehow re-registered)
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("invite_code_used, status")
      .eq("id", user.id)
      .single()

    if (existingProfile?.invite_code_used) {
      // Already registered — just send them to dashboard
      return NextResponse.redirect(`${origin}${next}`)
    }

    // Validate the invite code
    const { data: codeData } = await admin
      .from("invite_codes")
      .select("id, is_active, max_uses, uses_count, auto_approve, pool_id")
      .eq("code", inviteCode)
      .single()

    if (
      !codeData ||
      !codeData.is_active ||
      (codeData.max_uses !== null && codeData.uses_count >= codeData.max_uses)
    ) {
      // Invalid/exhausted code — clean up the new auth user and redirect
      await admin.auth.admin.deleteUser(user.id)
      return NextResponse.redirect(`${origin}/login?error=invite_invalid`)
    }

    const status = codeData.auto_approve ? "approved" : "pending"

    // Upsert profile (DB trigger may have already created it with status=pending)
    await admin.from("profiles").upsert(
      {
        id: user.id,
        email: user.email,
        display_name:
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0],
        avatar_url: user.user_metadata?.avatar_url ?? null,
        status,
        invite_code_used: inviteCode,
        is_test_user: false,
        provider: "google",
      },
      { onConflict: "id" }
    )

    // Increment uses_count atomically
    await admin.rpc("increment_invite_uses", { code_id: codeData.id })

    // Add user to the pool linked to this invite code (non-fatal)
    if (codeData.pool_id) {
      await admin.from("pool_members").upsert(
        { pool_id: codeData.pool_id, user_id: user.id, role: "member" },
        { onConflict: "pool_id,user_id" }
      )
    }

    if (status === "pending") {
      return NextResponse.redirect(`${origin}/pending`)
    }

    return NextResponse.redirect(`${origin}${next}`)
  }

  // ── LOGIN / EMAIL-CONFIRMATION FLOW ────────────────────────────────
  // Covers two cases with identical handling:
  //   a) Existing user signing in via email/password or Google (no invite_code)
  //   b) New email user clicking the confirmation link — profile was already
  //      created in /api/auth/signup, so nothing to set up here.
  // Middleware enforces pending/blocked status after redirect.
  return NextResponse.redirect(`${origin}${next}`)
}
