import { createClient, createAdminClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import Navbar from "@/components/Navbar"
import PoolSelector from "@/components/PoolSelector"
import Link from "next/link"
import type { Quiniela } from "@/lib/types"
import { getServerT } from "@/lib/server-lang"

export const dynamic = "force-dynamic"

const LEGACY_POOL_ID = "00000000-0000-0000-0000-000000000001"

export default async function RankingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  const admin = createAdminClient()
  const t = await getServerT()

  const { data: memberships } = await admin
    .from("pool_members")
    .select("pool_id, pools(id, name)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })

  const userPools = (memberships ?? []).map(m => ({
    id: m.pool_id,
    name: (m.pools as unknown as { name: string } | null)?.name ?? "General",
  }))

  const cookieStore = await cookies()
  const cookiePoolId = cookieStore.get("selected_pool")?.value
  const selectedPool =
    userPools.find(p => p.id === cookiePoolId) ??
    userPools.find(p => p.id !== LEGACY_POOL_ID) ??
    userPools[0] ??
    { id: LEGACY_POOL_ID, name: "General" }

  const poolId = selectedPool.id

  const { data: rawQuinielas } = await supabase
    .from("quinielas")
    .select("*, profiles(display_name, email, avatar_url)")
    .eq("status", "submitted")
    .eq("pool_id", poolId)
    .order("total_points", { ascending: false })
    .order("exact_results", { ascending: false })
    .order("correct_winners", { ascending: false })
    .order("created_at", { ascending: true })

  const quinielas = (rawQuinielas ?? []) as (Quiniela & { profiles: { display_name: string | null; email: string | null; avatar_url: string | null } })[]

  const COLS = "36px 1fr 52px 52px 52px"

  return (
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black leading-tight" style={{ color: "#111827" }}>{t("ranking_title")}</h1>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <PoolSelector pools={userPools} currentPoolId={poolId} />
              <span className="text-[#6b7280] text-xs">
                {selectedPool.name} · {quinielas.length === 1 ? t("quinielas_count").replace("{n}", "1") : t("quinielas_count_pl").replace("{n}", String(quinielas.length))}
              </span>
            </div>
          </div>
          <Link
            href="/quiniela/new"
            className="flex-shrink-0 py-2 px-4 rounded-lg font-bold text-black text-sm hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}
          >
            + {t("new")}
          </Link>
        </div>

        {/* Podium */}
        {quinielas.length >= 3 && (
          <div className="grid grid-cols-3 gap-2 mb-6">
            {[1, 0, 2].map(rankIndex => {
              const q = quinielas[rankIndex]
              const icons = ["🥇", "🥈", "🥉"]
              const isFirst = rankIndex === 0
              return (
                <Link key={q.id} href={`/quiniela/${q.id}`}>
                  <div
                    className={`flex flex-col items-center p-3 rounded-xl text-center cursor-pointer transition-opacity hover:opacity-90 ${rankIndex === 1 ? "mt-0" : "mt-4"}`}
                    style={{
                      background: isFirst ? "linear-gradient(135deg, #fffbeb, #fef3c7)" : "white",
                      border: isFirst ? "2px solid #F5C518" : "1px solid #d1d5db",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
                    }}
                  >
                    <span className="text-2xl mb-1">{icons[rankIndex]}</span>
                    <div className={`text-lg font-black ${isFirst ? "text-[#d97706]" : "text-[#374151]"}`}>{q.total_points}</div>
                    <div className="text-[#9ca3af] text-xs mb-1">{t("pts")}</div>
                    <div className="text-[#111827] text-xs font-medium truncate w-full">
                      {q.profiles?.display_name || q.profiles?.email?.split("@")[0]}
                    </div>
                    <div className="text-[#6b7280] text-xs truncate w-full">{q.name}</div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* Full table */}
        <div className="rounded-xl overflow-hidden" style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          {/* Header row */}
          <div
            className="grid items-center gap-2 px-3 py-2 text-[#374151] text-xs font-bold uppercase tracking-wider"
            style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", gridTemplateColumns: COLS }}
          >
            <span>#</span>
            <span>{t("predictions")}</span>
            <span className="text-right text-[#d97706]">{t("pts")}</span>
            <span className="text-right hidden sm:block">{t("exact")}</span>
            <span className="text-right hidden sm:block">{t("winners")}</span>
          </div>

          {quinielas.length === 0 ? (
            <div className="py-14 px-6 text-center">
              <div className="text-4xl mb-3">🏆</div>
              <p className="font-semibold" style={{ color: "#374151" }}>{t("no_quinielas")}</p>
              <p className="text-[#6b7280] text-sm mt-1">{t("no_quinielas_sub")}</p>
            </div>
          ) : (
            quinielas.map((q, i) => {
              const isMe = q.user_id === user.id
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null
              const tiedWithPrev = i > 0 && quinielas[i - 1].total_points === q.total_points
              const tiedWithNext = i < quinielas.length - 1 && quinielas[i].total_points === quinielas[i + 1].total_points
              const isTied = tiedWithPrev || tiedWithNext
              const accentColor = i === 0 ? "#F5C518" : i === 1 ? "#9ca3af" : "#cd7f32"

              return (
                <Link key={q.id} href={`/quiniela/${q.id}`}>
                  <div
                    className={`grid items-center gap-2 px-3 py-3 cursor-pointer transition-colors ${
                      isMe ? "bg-[#fffbeb] hover:bg-[#fef9e0]" : "bg-white hover:bg-gray-50"
                    } ${i < 3 ? "border-l-2" : ""}`}
                    style={{
                      gridTemplateColumns: COLS,
                      borderTop: "1px solid #f3f4f6",
                      ...(i < 3 ? { borderLeftColor: accentColor } : {}),
                    }}
                  >
                    <span className={`text-sm font-bold ${medal ? "" : isTied ? "text-[#6b7280]" : "text-[#9ca3af]"}`}>
                      {medal ?? (isTied ? `=${i + 1}` : i + 1)}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold truncate leading-tight ${isMe ? "text-[#92400e]" : "text-[#111827]"}`}>
                        {q.name}
                        {isMe && <span className="text-[#9ca3af] text-xs font-normal ml-1">{t("you_label")}</span>}
                      </p>
                      <p className="text-[#6b7280] text-xs truncate leading-tight">
                        {q.profiles?.display_name || q.profiles?.email?.split("@")[0]}
                      </p>
                    </div>
                    <span className={`text-right font-black text-lg ${i < 3 || isMe ? "text-[#d97706]" : "text-[#374151]"}`}>
                      {q.total_points}
                    </span>
                    <span className="text-right text-green-600 text-sm font-medium hidden sm:block">{q.exact_results}</span>
                    <span className="text-right text-blue-600 text-sm font-medium hidden sm:block">{q.correct_winners}</span>
                  </div>
                </Link>
              )
            })
          )}
        </div>

        <p className="mt-3 text-[#9ca3af] text-xs">{t("ranking_tiebreak")}</p>
      </div>
    </div>
  )
}
