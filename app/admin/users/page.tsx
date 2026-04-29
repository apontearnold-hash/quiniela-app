import { createClient, createAdminClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import Navbar from "@/components/Navbar"
import UsersPanel from "@/components/UsersPanel"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  if (!isAdmin) redirect("/dashboard")

  const admin = createAdminClient()

  const [
    { data: profiles },
    { data: counts },
    { data: poolsData },
    { data: membershipsData },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, email, display_name, status, invite_code_used, is_test_user, provider, created_at")
      .order("created_at", { ascending: false }),
    admin.from("quinielas").select("user_id"),
    admin.from("pools").select("id, name").eq("is_active", true).order("name"),
    admin.from("pool_members").select("user_id, pool_id, pools(id, name)"),
  ])

  const quinielaCounts: Record<string, number> = {}
  for (const q of counts ?? []) {
    quinielaCounts[q.user_id] = (quinielaCounts[q.user_id] ?? 0) + 1
  }

  const poolMemberships: Record<string, { pool_id: string; name: string }[]> = {}
  for (const m of membershipsData ?? []) {
    const poolName = (m.pools as unknown as { name: string } | null)?.name ?? "?"
    if (!poolMemberships[m.user_id]) poolMemberships[m.user_id] = []
    poolMemberships[m.user_id].push({ pool_id: m.pool_id, name: poolName })
  }

  const users = (profiles ?? []).map(p => ({
    ...p,
    quiniela_count: quinielaCounts[p.id] ?? 0,
  }))

  const pools = (poolsData ?? []).map(p => ({ id: p.id, name: p.name }))

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "32px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
          <Link href="/admin?tab=ligas" style={{ color: "#2563eb", fontSize: "14px", textDecoration: "none", fontWeight: 500 }}>← Admin</Link>
          <h1 style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", margin: 0 }}>Usuarios</h1>
          <span style={{ padding: "2px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, background: "#dbeafe", color: "#1d4ed8" }}>
            {users.length}
          </span>
        </div>
        <UsersPanel users={users} currentAdminEmail={user.email ?? ""} pools={pools} poolMemberships={poolMemberships} />
      </div>
    </div>
  )
}
