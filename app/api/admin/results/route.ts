import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import {
  recalculateGroupStandings,
  fillGroupAdvancers,
  assignBest3rd,
  advanceKnockout,
} from "@/lib/bracket"
import { recalculateAllPoints } from "@/lib/recalculate"

export async function POST(request: Request) {
  // Auth check via session client (anon key + user JWT — correct for auth only)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  console.log("[results] payload received:", JSON.stringify(body))

  const { fixture_id, home_score, away_score, went_to_penalties, penalties_winner, status } = body

  if (fixture_id === undefined || home_score === undefined || away_score === undefined) {
    console.log("[results] missing required fields:", { fixture_id, home_score, away_score })
    return NextResponse.json({ error: "Missing fields: fixture_id, home_score, away_score are required" }, { status: 400 })
  }

  // Service-role client: uses @supabase/supabase-js directly (no cookie store, no
  // user JWT injected). PostgREST sees the service_role JWT as Authorization header
  // and sets role=service_role, bypassing all RLS policies.
  const admin = createAdminClient()
  console.log("[results] service role key present:", !!process.env.SUPABASE_SERVICE_ROLE_KEY)
  console.log("[results] updating fixture id:", fixture_id, "type:", typeof fixture_id)

  // Priority guard: API results (result_source = 'api') are authoritative.
  // Reject manual writes so an admin typo never silently overwrites official data.
  const { data: existing } = await admin
    .from("fixtures")
    .select("result_source")
    .eq("id", fixture_id)
    .single()

  if (existing?.result_source === "api") {
    console.warn("[results] blocked: fixture has result_source='api'", fixture_id)
    return NextResponse.json(
      { error: "Este resultado ya fue publicado por la API oficial. No se puede sobreescribir con un resultado manual." },
      { status: 409 }
    )
  }

  // .select() after .update() is required to detect 0-row updates.
  // Without it, Supabase returns { data: null, error: null } whether 0 or N rows
  // were updated — making success indistinguishable from a silent no-op.
  const { data: updated, error } = await admin
    .from("fixtures")
    .update({
      home_score,
      away_score,
      went_to_penalties: went_to_penalties ?? false,
      penalties_winner: penalties_winner ?? null,
      status: status ?? "finished",
      result_source: "manual",
    })
    .eq("id", fixture_id)
    .select("id, home_score, away_score, status")

  console.log("[results] supabase response — error:", error?.message ?? null, "| rows:", updated?.length ?? 0)

  if (error) {
    console.error("[results] update error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!updated || updated.length === 0) {
    console.error("[results] 0 rows updated — fixture_id not found or RLS still blocking:", fixture_id)
    return NextResponse.json(
      { error: `No fixture updated. fixture_id=${fixture_id} did not match any row (or RLS is still blocking).` },
      { status: 404 }
    )
  }

  console.log("[results] successfully updated:", updated[0])

  // Full update pipeline: bracket advancement → point recalculation.
  // Non-fatal so a pipeline error never blocks the fixture save.
  // pipelineError is returned to the client so the UI can surface it.
  let pipelineError: string | null = null
  try {
    const standings = await recalculateGroupStandings(admin)
    await fillGroupAdvancers(admin, standings)
    await assignBest3rd(admin, standings)
    await advanceKnockout(admin)
    await recalculateAllPoints(admin)
    console.log("[results] pipeline completed")
  } catch (e) {
    pipelineError = e instanceof Error ? e.message : String(e)
    console.error("[results] pipeline error (fixture was saved):", pipelineError)
  }

  revalidatePath("/grupos")
  revalidatePath("/")

  return NextResponse.json({ success: true, fixture: updated[0], pipelineError })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { fixture_id } = body

  if (fixture_id === undefined) {
    return NextResponse.json({ error: "Missing fixture_id" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Same priority guard as POST: never clear an official API result.
  // Also fetch group_name now so we can purge stale standings rows below.
  const { data: existing } = await admin
    .from("fixtures")
    .select("result_source, group_name")
    .eq("id", fixture_id)
    .single()

  if (existing?.result_source === "api") {
    return NextResponse.json(
      { error: "Este resultado es oficial (API). No se puede borrar manualmente." },
      { status: 409 }
    )
  }

  const { data: updated, error } = await admin
    .from("fixtures")
    .update({
      home_score: null,
      away_score: null,
      went_to_penalties: false,
      penalties_winner: null,
      status: "not_started",
      result_source: null,
    })
    .eq("id", fixture_id)
    .select("id, status")

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: `fixture_id=${fixture_id} not found` }, { status: 404 })
  }

  let pipelineError: string | null = null
  try {
    // Purge stale standings for the affected group before recalculating.
    // recalculateGroupStandings uses upsert-only (never deletes), so if this
    // was the last finished game in the group, old rows would persist otherwise.
    if (existing?.group_name) {
      await admin.from("groups").delete().eq("group_name", existing.group_name)
    }

    const standings = await recalculateGroupStandings(admin)
    await fillGroupAdvancers(admin, standings)
    await assignBest3rd(admin, standings)
    await advanceKnockout(admin)
    await recalculateAllPoints(admin)
  } catch (e) {
    pipelineError = e instanceof Error ? e.message : String(e)
  }

  revalidatePath("/grupos")
  revalidatePath("/")

  return NextResponse.json({ success: true, fixture: updated[0], pipelineError })
}
