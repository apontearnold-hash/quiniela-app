import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"

// GET /api/admin/snapshot/[id]
// Returns a snapshot's full snapshot_data plus fixture metadata for displaying
// group predictions. Read-only — never modifies any data.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: snap, error } = await admin
    .from("quiniela_snapshots")
    .select("id, quiniela_id, snapshot_type, created_at, notes, snapshot_data")
    .eq("id", id)
    .single()

  if (error || !snap) return NextResponse.json({ error: "Snapshot no encontrado" }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapData = snap.snapshot_data as any

  // Build fixture lookup for group-stage predictions (so we can show team names)
  const fixtureIds: number[] = (snapData?.predictions ?? [])
    .map((p: { fixture_id?: number }) => p.fixture_id)
    .filter((id: unknown): id is number => typeof id === "number")

  const fixtureMap: Record<number, { home: string; away: string; group: string; kickoff: string | null }> = {}

  if (fixtureIds.length > 0) {
    const { data: fixtures } = await admin
      .from("fixtures")
      .select("id, home_team_name, away_team_name, group_name, kickoff")
      .in("id", fixtureIds)

    for (const f of fixtures ?? []) {
      fixtureMap[f.id] = {
        home:    f.home_team_name ?? `Fixture ${f.id}`,
        away:    f.away_team_name ?? `Fixture ${f.id}`,
        group:   f.group_name    ?? "—",
        kickoff: f.kickoff       ?? null,
      }
    }
  }

  return NextResponse.json({ snapshot: snap, fixtures: fixtureMap })
}
