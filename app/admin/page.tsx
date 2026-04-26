import { createClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import Navbar from "@/components/Navbar"
import AdminPanel from "@/components/AdminPanel"
import type { Fixture } from "@/lib/types"
import { getServerT } from "@/lib/server-lang"

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  if (!isAdmin) redirect("/dashboard")

  const t = await getServerT()

  const { data: fixtures } = await supabase
    .from("fixtures")
    .select("*")
    .order("kickoff", { ascending: true })

  const { count: totalQuinielas } = await supabase
    .from("quinielas")
    .select("*", { count: "exact", head: true })

  const { count: totalUsers } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })

  const { count: fixturesWithResult } = await supabase
    .from("fixtures")
    .select("*", { count: "exact", head: true })
    .not("home_score", "is", null)

  const stats = [
    { label: t("admin_quinielas"),   value: totalQuinielas ?? 0,       icon: "🎯" },
    { label: t("admin_users"),       value: totalUsers ?? 0,           icon: "👥" },
    { label: t("admin_matches"),     value: fixtures?.length ?? 0,     icon: "⚽" },
    { label: t("admin_with_result"), value: fixturesWithResult ?? 0,   icon: "✅" },
  ]

  return (
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-black" style={{ color: "#111827" }}>{t("admin_title")}</h1>
          <p className="text-[#6b7280] text-sm mt-1">{t("admin_subtitle")} · {user.email}</p>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {stats.map(s => (
            <div
              key={s.label}
              className="flex flex-col items-center gap-2 p-4 rounded-xl"
              style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
            >
              <span className="text-2xl">{s.icon}</span>
              <span className="text-2xl font-black" style={{ color: "#d97706" }}>{s.value}</span>
              <span className="text-[#6b7280] text-xs">{s.label}</span>
            </div>
          ))}
        </div>

        <AdminPanel fixtures={(fixtures ?? []) as Fixture[]} />
      </div>
    </div>
  )
}
