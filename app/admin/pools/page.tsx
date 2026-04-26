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
    <div className="min-h-screen" style={{ background: "#0a1208" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin" className="text-[#7ab88a] text-sm hover:text-white">← Admin</Link>
          <h1 className="text-2xl font-black text-white">Ligas</h1>
          <span className="px-2 py-0.5 rounded-full text-xs font-bold text-black"
            style={{ background: "#F5C518" }}>{poolsWithCounts.length}</span>
        </div>
        <p className="text-[#7ab88a] text-sm mb-6">
          Cada liga tiene sus propios participantes, precio y ranking.
          Los códigos de invitación asignan nuevos usuarios a una liga específica.
        </p>
        <PoolsPanel pools={poolsWithCounts} />
      </div>
    </div>
  )
}
