import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { apiFetch, getApiKey } from "@/lib/api-football"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const fixtureId = parseInt(id, 10)
  if (isNaN(fixtureId) || fixtureId <= 0) {
    return NextResponse.json({ error: "Invalid fixture ID" }, { status: 400 })
  }

  if (!getApiKey()) {
    return NextResponse.json({ events: [], statistics: [], lineups: [], apiMissing: true })
  }

  try {
    const [eventsRes, statsRes, lineupsRes] = await Promise.all([
      apiFetch(`/fixtures/events?fixture=${fixtureId}`),
      apiFetch(`/fixtures/statistics?fixture=${fixtureId}`),
      apiFetch(`/fixtures/lineups?fixture=${fixtureId}`),
    ])

    const [eventsData, statsData, lineupsData] = await Promise.all([
      eventsRes.json(),
      statsRes.json(),
      lineupsRes.json(),
    ])

    return NextResponse.json({
      events:     eventsData.response  ?? [],
      statistics: statsData.response   ?? [],
      lineups:    lineupsData.response ?? [],
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch", events: [], statistics: [], lineups: [] },
      { status: 502 }
    )
  }
}
