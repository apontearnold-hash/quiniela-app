import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { apiFetch, getApiKey } from "@/lib/api-football"

export interface SquadPlayer {
  id:       number
  name:     string
  age:      number | null
  number:   number | null
  position: string
  photo:    string | null
}

interface RawPlayer {
  id:       number
  name:     string
  age:      number | null
  number:   number | null
  position: string
  photo:    string | null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { teamId } = await params
  const tid = parseInt(teamId, 10)
  if (isNaN(tid)) return NextResponse.json({ error: "Invalid teamId" }, { status: 400 })

  if (!getApiKey()) return NextResponse.json({ players: [] })

  try {
    const res = await apiFetch(`/players/squads?team=${tid}`)
    if (!res.ok) return NextResponse.json({ players: [] })

    const json = await res.json()
    const raw: RawPlayer[] = json.response?.[0]?.players ?? []

    const players: SquadPlayer[] = raw.map(p => ({
      id:       p.id,
      name:     p.name,
      age:      p.age      ?? null,
      number:   p.number   ?? null,
      position: p.position ?? "Unknown",
      photo:    p.photo    ?? null,
    }))

    return NextResponse.json({ players })
  } catch {
    return NextResponse.json({ players: [] })
  }
}
