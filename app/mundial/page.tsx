import { createClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import Navbar from "@/components/Navbar"
import type { Fixture, GroupStanding } from "@/lib/types"
import MundialContent from "@/components/mundial/MundialContent"

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

  return (
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />
      <MundialContent
        standings={(standings ?? []) as GroupStanding[]}
        fixtures={(allFixtures ?? []) as Fixture[]}
      />
    </div>
  )
}
