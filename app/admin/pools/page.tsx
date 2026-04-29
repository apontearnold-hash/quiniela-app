import { createClient, createAdminClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import Navbar from "@/components/Navbar"
import PoolsPanel from "@/components/PoolsPanel"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default async function AdminPoolsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  if (!isAdmin) redirect("/dashboard")

  const admin = createAdminClient()

  const { data: pools } = await admin
    .from("pools")
    .select("*")
    .order("created_at", { ascending: true })

  const { data: members } = await admin.from("pool_members").select("pool_id")
  const memberCounts: Record<string, number> = {}
  for (const m of members ?? []) {
    memberCounts[m.pool_id] = (memberCounts[m.pool_id] ?? 0) + 1
  }

  const { data: quinielas } = await admin.from("quinielas").select("pool_id")
  const quinielaCounts: Record<string, number> = {}
  for (const q of quinielas ?? []) {
    if (q.pool_id) quinielaCounts[q.pool_id] = (quinielaCounts[q.pool_id] ?? 0) + 1
  }

  const poolsWithCounts = (pools ?? []).map(p => ({
    ...p,
    member_count: memberCounts[p.id] ?? 0,
    quiniela_count: quinielaCounts[p.id] ?? 0,
  }))

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />
      <div style={{ maxWidth: "960px", margin: "0 auto", padding: "32px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <Link href="/admin?tab=ligas" style={{ color: "#2563eb", fontSize: "14px", textDecoration: "none", fontWeight: 500 }}>← Admin</Link>
          <h1 style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", margin: 0 }}>Ligas</h1>
          <span style={{ padding: "2px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 700, background: "#dbeafe", color: "#1d4ed8" }}>
            {poolsWithCounts.length}
          </span>
        </div>
        <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "24px" }}>
          Cada liga tiene sus propios participantes, precio y ranking.
          Los códigos de invitación asignan nuevos usuarios a una liga específica.
        </p>
        <PoolsPanel pools={poolsWithCounts} />
      </div>
    </div>
  )
}
