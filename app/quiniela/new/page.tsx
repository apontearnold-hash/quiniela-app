import { createClient, createAdminClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import Navbar from "@/components/Navbar"
import CreateQuinielaForm from "@/components/CreateQuinielaForm"
import { getServerT } from "@/lib/server-lang"

const LEGACY_POOL_ID = "00000000-0000-0000-0000-000000000001"

export default async function NewQuinielaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  const t = await getServerT()

  // Get user's pool memberships (admin client bypasses RLS grant issues)
  const admin = createAdminClient()
  const { data: memberships } = await admin
    .from("pool_members")
    .select("pool_id, pools(id, name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })

  const userPools = (memberships ?? []).map(m => ({
    id: m.pool_id,
    name: (m.pools as unknown as { name: string } | null)?.name ?? "General",
  }))

  // Default to the pool selected on dashboard (cookie), or first membership
  const cookieStore = await cookies()
  const cookiePoolId = cookieStore.get("selected_pool")?.value
  const defaultPoolId =
    userPools.find(p => p.id === cookiePoolId)?.id ??
    userPools.find(p => p.id !== LEGACY_POOL_ID)?.id ??
    userPools[0]?.id ??
    LEGACY_POOL_ID

  // Get list of teams for bonus picks
  const { data: teamsRaw } = await supabase
    .from("fixtures")
    .select("home_team_name, home_team_flag, home_team_id, away_team_name, away_team_flag, away_team_id")
    .limit(200)

  const teamMap = new Map<string, { flag: string; id: number | null }>()
  teamsRaw?.forEach(f => {
    if (f.home_team_name) teamMap.set(f.home_team_name, { flag: f.home_team_flag ?? "", id: f.home_team_id })
    if (f.away_team_name) teamMap.set(f.away_team_name, { flag: f.away_team_flag ?? "", id: f.away_team_id })
  })
  const teamList = Array.from(teamMap.entries())
    .map(([name, { flag, id }]) => ({ name, flag, id: id ?? undefined }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-black" style={{ color: "#111827" }}>{t("quiniela_new_title")}</h1>
          <p className="text-sm mt-1" style={{ color: "#6b7280" }}>{t("quiniela_new_subtitle")}</p>
        </div>
        <CreateQuinielaForm
          teams={teamList}
          userId={user.id}
          defaultPoolId={defaultPoolId}
          userPools={userPools}
        />
      </div>
    </div>
  )
}
