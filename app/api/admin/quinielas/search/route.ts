import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

// GET /api/admin/quinielas/search?q=term
// Searches quinielas by name (or UUID if q looks like one).
// Returns quiniela list with user email and snapshot count.
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? ""
  if (!q) return NextResponse.json({ results: [] })

  const admin = createAdminClient()

  // Detect UUID-style query
  const isUUID = /^[0-9a-f-]{36}$/i.test(q)

  const quinielasQuery = admin
    .from("quinielas")
    .select("id, name, status, user_id, profiles(email, display_name)")
    .order("created_at", { ascending: false })
    .limit(20)

  const { data: quinielas, error } = isUUID
    ? await quinielasQuery.eq("id", q)
    : await quinielasQuery.ilike("name", `%${q}%`)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!quinielas || quinielas.length === 0) return NextResponse.json({ results: [] })

  // Snapshot counts per quiniela
  const ids = quinielas.map(q => q.id)
  const { data: snapshotRows } = await admin
    .from("quiniela_snapshots")
    .select("quiniela_id")
    .in("quiniela_id", ids)

  const countMap: Record<string, number> = {}
  for (const row of snapshotRows ?? []) {
    countMap[row.quiniela_id] = (countMap[row.quiniela_id] ?? 0) + 1
  }

  const results = quinielas.map(q => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = (q.profiles as any)
    return {
      id:             q.id,
      name:           q.name,
      status:         q.status,
      user_email:     profile?.email ?? "—",
      display_name:   profile?.display_name ?? null,
      snapshot_count: countMap[q.id] ?? 0,
    }
  })

  return NextResponse.json({ results })
}
