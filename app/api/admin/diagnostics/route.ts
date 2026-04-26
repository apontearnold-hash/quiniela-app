import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY
  if (!apiKey) {
    return NextResponse.json({ keyPresent: false, success: false, error: "Agrega API_FOOTBALL_KEY a .env.local" })
  }

  try {
    const res = await fetch("https://v3.football.api-sports.io/leagues?id=1&season=2026", {
      headers: { "x-apisports-key": apiKey },
      cache: "no-store",
    })
    const data = await res.json()

    if (!res.ok || (data.errors && Object.keys(data.errors).length > 0)) {
      const errMsg = data.errors ? Object.values(data.errors).join(", ") : `HTTP ${res.status}`
      return NextResponse.json({ keyPresent: true, success: false, error: errMsg })
    }

    const league = data.response?.[0]
    const seasonData = league?.seasons?.find((s: { year: number }) => s.year === 2026)
    const coverage = seasonData?.coverage ?? {}

    return NextResponse.json({
      keyPresent: true,
      success: true,
      leagueName: league?.league?.name ?? "Unknown",
      country: league?.country?.name ?? "Unknown",
      coverage,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({
      keyPresent: true,
      success: false,
      error: `Error de red: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}
