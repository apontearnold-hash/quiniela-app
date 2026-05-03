import { createClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import Navbar from "@/components/Navbar"
import type { Fixture, GroupStanding } from "@/lib/types"
import MundialContent from "@/components/mundial/MundialContent"
import type { TopScorer } from "@/components/mundial/TopScorers"
import { apiFetch, getApiKey, LEAGUE_ID, SEASON } from "@/lib/api-football"

export const dynamic = "force-dynamic"

export default async function MundialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL

  const [{ data: standings }, { data: allFixtures }] = await Promise.all([
    supabase
      .from("groups")
      .select("*")
      .order("group_name", { ascending: true })
      .order("points", { ascending: false })
      .order("goal_difference", { ascending: false })
      .order("goals_for", { ascending: false }),
    supabase
      .from("fixtures")
      .select("*")
      .order("kickoff", { ascending: true }),
  ])

  let topScorers: TopScorer[] = []
  if (getApiKey()) {
    try {
      const res = await apiFetch(`/players/topscorers?league=${LEAGUE_ID}&season=${SEASON}`, { revalidate: 1800 })
      if (res.ok) {
        const json = await res.json()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const players: any[] = json.response ?? []
        topScorers = players.slice(0, 5).map(p => ({
          playerId:    p.player.id,
          playerName:  p.player.name,
          playerPhoto: p.player.photo ?? null,
          teamName:    p.statistics[0]?.team?.name ?? "",
          teamFlag:    p.statistics[0]?.team?.logo ?? null,
          goals:       p.statistics[0]?.goals?.total ?? 0,
          assists:     p.statistics[0]?.goals?.assists ?? 0,
        }))
      }
    } catch {
      // Tournament hasn't started or API unavailable — show empty state
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />
      <MundialContent
        standings={(standings ?? []) as GroupStanding[]}
        fixtures={(allFixtures ?? []) as Fixture[]}
        topScorers={topScorers}
      />
    </div>
  )
}
