import { createClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import Navbar from "@/components/Navbar"
import AdminPanel from "@/components/AdminPanel"
import type { Fixture } from "@/lib/types"
import { getServerT } from "@/lib/server-lang"

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  if (!isAdmin) redirect("/dashboard")

  const t = await getServerT()
  const { tab: defaultTab } = await searchParams

  const { data: fixtures } = await supabase
    .from("fixtures")
    .select("*")
    .order("kickoff", { ascending: true })

  const [
    { count: totalQuinielas },
    { count: totalUsers },
    { count: fixturesWithResult },
  ] = await Promise.all([
    supabase.from("quinielas").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("fixtures").select("*", { count: "exact", head: true }).not("home_score", "is", null),
  ])

  return (
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-black" style={{ color: "#111827" }}>{t("admin_title")}</h1>
          <p className="text-[#6b7280] text-sm mt-1">{t("admin_subtitle")} · {user.email}</p>
        </div>

        {/* Compact stats bar */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-6 px-4 py-2.5 rounded-xl text-xs"
          style={{ background: "white", border: "1px solid #d1d5db" }}>
          <span><span className="font-black text-[#d97706]">{totalQuinielas ?? 0}</span> <span className="text-[#6b7280]">quinielas</span></span>
          <span className="text-[#d1d5db]">·</span>
          <span><span className="font-black text-[#d97706]">{totalUsers ?? 0}</span> <span className="text-[#6b7280]">usuarios</span></span>
          <span className="text-[#d1d5db]">·</span>
          <span><span className="font-black text-[#d97706]">{fixtures?.length ?? 0}</span> <span className="text-[#6b7280]">partidos</span></span>
          <span className="text-[#d1d5db]">·</span>
          <span><span className="font-black text-[#d97706]">{fixturesWithResult ?? 0}</span> <span className="text-[#6b7280]">con resultado</span></span>
        </div>

        <AdminPanel fixtures={(fixtures ?? []) as Fixture[]} defaultTab={defaultTab} />
      </div>
    </div>
  )
}
