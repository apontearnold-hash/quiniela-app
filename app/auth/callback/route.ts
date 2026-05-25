import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")

  // Invite code: prefer URL param. Fall back to cookie if the OAuth provider
  // stripped query params from the redirectTo URL (common in some environments).
  const urlInviteCode = searchParams.get("invite_code")?.trim().toUpperCase() ?? null
  const cookieInviteCode =
    decodeURIComponent(request.cookies.get("pending_invite_code")?.value ?? "")
      .trim()
      .toUpperCase() || null
  const inviteCode = urlInviteCode ?? cookieInviteCode
  const next = searchParams.get("next") ?? "/dashboard"

  if (urlInviteCode) {
    console.log("[auth/callback] invite_code from URL param:", urlInviteCode)
  } else if (cookieInviteCode) {
    console.log("[auth/callback] invite_code recovered from cookie fallback:", cookieInviteCode)
  } else {
    console.log("[auth/callback] no invite_code — login flow")
  }

  // Always clear the pending_invite_code cookie in every response path.
  function respond(url: string): NextResponse {
    const res = NextResponse.redirect(url)
    res.cookies.set("pending_invite_code", "", { maxAge: 0, path: "/" })
    return res
  }

  if (!code) {
    console.error("[auth/callback] missing OAuth code")
    return respond(`${origin}/login?error=auth`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.session?.user) {
    console.error("[auth/callback] exchangeCodeForSession failed:", error?.message)
    return respond(`${origin}/login?error=auth`)
  }

  const user = data.session.user
  const admin = createAdminClient()

  // KEY LOGIC:
  // invite_code present  → Register tab flow → set up profile + pool
  // invite_code absent   → Login tab flow    → middleware enforces pending/blocked
  if (inviteCode) {
    // ── REGISTRATION FLOW ────────────────────────────────────────────
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("invite_code_used, status")
      .eq("id", user.id)
      .single()

    if (existingProfile?.invite_code_used) {
      console.log("[auth/callback] user already registered, skipping setup:", user.id)
      return respond(`${origin}${next}`)
    }

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
      console.error("[auth/callback] invalid/exhausted invite code:", inviteCode, "user:", user.id)
      // Only delete the auth user if they have no existing profile (truly new user)
      if (!existingProfile) {
        await admin.auth.admin.deleteUser(user.id)
      }
      return respond(`${origin}/login?error=invite_invalid`)
    }

    const status = codeData.auto_approve ? "approved" : "pending"
    console.log("[auth/callback] registering user:", user.id, "invite:", inviteCode, "status:", status)

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

    await admin.rpc("increment_invite_uses", { code_id: codeData.id })

    if (codeData.pool_id) {
      const { error: pmError } = await admin.from("pool_members").upsert(
        { pool_id: codeData.pool_id, user_id: user.id, role: "member" },
        { onConflict: "pool_id,user_id" }
      )
      if (pmError) {
        console.error("[auth/callback] pool_members upsert failed — user:", user.id, "pool:", codeData.pool_id, "—", pmError.message)
      } else {
        console.log("[auth/callback] user added to pool:", codeData.pool_id)
      }
    } else {
      console.error("[auth/callback] invite code", inviteCode, "has no pool_id — user", user.id, "registered without a league")
    }

    return respond(status === "pending" ? `${origin}/pending` : `${origin}${next}`)
  }

  // ── LOGIN / EMAIL-CONFIRMATION FLOW ────────────────────────────────
  console.log("[auth/callback] login flow, redirecting to:", next)
  return respond(`${origin}${next}`)
}
