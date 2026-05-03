import { createClient, createAdminClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import Navbar from "@/components/Navbar"
import PoolSelector from "@/components/PoolSelector"
import JoinLeagueButton from "@/components/JoinLeagueButton"
import Link from "next/link"
import type { Quiniela } from "@/lib/types"
import { RecentFixtureTicker, UpcomingFixtureTicker } from "@/components/FixtureTicker"
import type { RecentFixtureItem, UpcomingFixtureItem } from "@/components/FixtureTicker"
import LeaderboardClient from "@/components/LeaderboardClient"
import { getServerT } from "@/lib/server-lang"
import { deriveChampions } from "@/lib/derive-champion"
import type { Fixture } from "@/lib/types"

export const dynamic = "force-dynamic"

const LEGACY_POOL_ID = "00000000-0000-0000-0000-000000000001"

// ── Inline sub-components ──────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#374151" }}>
      {children}
    </p>
  )
}

function BonusTable({
  icon,
  label,
  picks,
  total,
  flagMap,
}: {
  icon: string
  label: string
  picks: [string, number][]
  total: number
  flagMap?: Map<string, string>
}) {
  if (picks.length === 0) return null
  return (
    <div
      className="flex-1 rounded-xl overflow-hidden"
      style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}
    >
      {/* Header */}
      <div className="px-4 py-2.5" style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#374151" }}>
          {icon} {label}
        </p>
      </div>
      {/* Rows */}
      {picks.map(([name, count], i) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0
        const flag = flagMap?.get(name)
        return (
          <div
            key={name}
            className="px-4 py-3"
            style={{ borderTop: i > 0 ? "1px solid #f3f4f6" : undefined }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {flag && (
                <img src={flag} alt={name} className="w-5 h-3.5 object-contain rounded-sm flex-shrink-0" />
              )}
              <span className="text-sm font-medium truncate flex-1" style={{ color: "#1f2937" }}>{name}</span>
              <span className="text-xs font-bold flex-shrink-0" style={{ color: "#d97706" }}>
                {count} ({pct}%)
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#f3f4f6" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#F5C518" }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  const admin = createAdminClient()
  const t = await getServerT()

  // ── Pool selection ──────────────────────────────────────────────────
  const { data: memberships } = await admin
    .from("pool_members")
    .select("pool_id, joined_at, pools(id, name, price_per_quiniela, currency, prize_type, prize_1st, prize_2nd, prize_3rd)")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })

  const userPools = (memberships ?? []).map(m => {
    const p = m.pools as unknown as { id: string; name: string; price_per_quiniela: number; currency: string; prize_type: string | null; prize_1st: string | null; prize_2nd: string | null; prize_3rd: string | null } | null
    return {
      id: m.pool_id,
      name: p?.name ?? "General",
      price: p?.price_per_quiniela ?? 5,
      currency: p?.currency ?? "USD",
      prizeType: (p?.prize_type ?? "money") as "money" | "physical",
      prize1st: p?.prize_1st ?? null,
      prize2nd: p?.prize_2nd ?? null,
      prize3rd: p?.prize_3rd ?? null,
    }
  })

  const cookieStore = await cookies()
  const cookiePoolId = cookieStore.get("selected_pool")?.value
  const selectedPool =
    userPools.find(p => p.id === cookiePoolId) ??
    userPools.find(p => p.id !== LEGACY_POOL_ID) ??
    userPools[0] ??
    { id: LEGACY_POOL_ID, name: "General", price: 5, currency: "USD", prizeType: "money" as "money" | "physical", prize1st: null, prize2nd: null, prize3rd: null }

  const poolId = selectedPool.id

  // ── Leaderboard ─────────────────────────────────────────────────────
  // Use admin client: user JWT + RLS can return empty results for cross-user
  // queries in server-side Next.js even when policies are correct. Business
  // rules (pool membership) are enforced by the membership query above.
  const { data: submittedQuinielas } = await admin
    .from("quinielas")
    .select("*, profiles(display_name, email, avatar_url)")
    .eq("status", "submitted")
    .eq("pool_id", poolId)
    .eq("is_test", false)
    .order("total_points", { ascending: false })
    .order("exact_results", { ascending: false })
    .order("correct_winners", { ascending: false })
    .order("created_at", { ascending: true })

  const quinielas = (submittedQuinielas ?? []) as (Quiniela & { profiles: { display_name: string | null; email: string | null } | null })[]

  // ── My quinielas (all statuses — drafts shown in filter view) ───────
  // Admin client + explicit user_id filter is reliable regardless of RLS state.
  const { data: myQuinielasData } = await admin
    .from("quinielas")
    .select("*")
    .eq("user_id", user.id)
    .eq("pool_id", poolId)
    .order("created_at", { ascending: true })

  const myQuinielas = (myQuinielasData ?? []) as Quiniela[]

  // ── Prize pool ──────────────────────────────────────────────────────
  const { price, currency, prizeType, prize1st, prize2nd, prize3rd } = selectedPool
  const isPhysicalPrize = prizeType === "physical"
  const totalQ    = quinielas.length
  const pool      = price * totalQ
  const lastPrize = price
  const dist      = Math.max(0, pool - lastPrize)
  const prizes    = { first: dist * 0.5, second: dist * 0.3, third: dist * 0.2, last: lastPrize }

  const mySubmittedCount = myQuinielas.filter(q => q.status === "submitted").length
  const userOwes         = mySubmittedCount * price

  // ── Bonus pick stats ─────────────────────────────────────────────────
  const { data: bonusPicks } = await admin
    .from("quinielas")
    .select("top_scorer_pick, most_goals_team_pick")
    .eq("status", "submitted")
    .eq("pool_id", poolId)
    .eq("is_test", false)

  function countPicks(field: "top_scorer_pick" | "most_goals_team_pick"): [string, number][] {
    const counts: Record<string, number> = {}
    for (const q of bonusPicks ?? []) {
      const val = (q as Record<string, string | null>)[field]
      if (val) counts[val] = (counts[val] ?? 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }

  const topScorer = countPicks("top_scorer_pick")
  const topGoals  = countPicks("most_goals_team_pick")

  // ── Team flag map (for bonus summary flags) ───────────────────────
  const { data: flagRows } = await supabase
    .from("fixtures")
    .select("home_team_name, home_team_flag, away_team_name, away_team_flag")
    .limit(200)

  const teamFlagMap = new Map<string, string>()
  flagRows?.forEach(f => {
    if (f.home_team_name && f.home_team_flag) teamFlagMap.set(f.home_team_name, f.home_team_flag)
    if (f.away_team_name && f.away_team_flag) teamFlagMap.set(f.away_team_name, f.away_team_flag)
  })

  const teamFlagsRecord: Record<string, string> = Object.fromEntries(teamFlagMap)

  // ── Champion fallback (derive from bracket picks for quinielas without stored champion) ──
  const needsDerivation = quinielas.filter(q => !q.champion_team_name)
  let enrichedQuinielas: typeof quinielas = quinielas

  if (needsDerivation.length > 0) {
    const needsIds = needsDerivation.map(q => q.id)
    // Use admin client: regular client is subject to RLS and cannot read
    // other users' predictions/bracket_picks even for display purposes.
    const [{ data: gFixtures }, { data: dPreds }, { data: dBpicks }] = await Promise.all([
      admin.from("fixtures").select("*").eq("phase", "groups"),
      admin.from("predictions")
        .select("quiniela_id, fixture_id, home_score_pred, away_score_pred, predicts_penalties, penalties_winner")
        .in("quiniela_id", needsIds),
      admin.from("bracket_picks")
        .select("quiniela_id, slot_key, home_score_pred, away_score_pred, predicts_penalties, penalties_winner")
        .in("quiniela_id", needsIds),
    ])

    const derivedMap = deriveChampions(
      needsIds,
      (gFixtures ?? []) as Fixture[],
      (dPreds ?? []) as Parameters<typeof deriveChampions>[2],
      (dBpicks ?? []) as Parameters<typeof deriveChampions>[3],
    )

    enrichedQuinielas = quinielas.map(q => {
      if (q.champion_team_name) return q
      const d = derivedMap.get(q.id)
      if (!d) return q
      return { ...q, champion_team_name: d.name, champion_team_flag: d.flag }
    })
  }

  // ── Fixtures ────────────────────────────────────────────────────────
  const [{ data: recentFixturesRaw }, { data: upcomingFixturesRaw }] = await Promise.all([
    supabase
      .from("fixtures")
      .select("id, home_team_name, away_team_name, home_team_flag, away_team_flag, home_score, away_score, kickoff, went_to_penalties, penalties_winner")
      .eq("status", "finished")
      .order("kickoff", { ascending: false })
      .limit(8),
    supabase
      .from("fixtures")
      .select("id, home_team_name, away_team_name, home_team_flag, away_team_flag, kickoff, home_placeholder, away_placeholder")
      .neq("status", "finished")
      .not("home_team_id", "is", null)
      .order("kickoff", { ascending: true })
      .limit(8),
  ])

  const recentFixtures   = (recentFixturesRaw  ?? []) as RecentFixtureItem[]
  const upcomingFixtures = (upcomingFixturesRaw ?? []) as UpcomingFixtureItem[]

  const poolSelectorList = userPools.map(p => ({ id: p.id, name: p.name }))

  return (
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* ── Page header ──────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black" style={{ color: "#111827" }}>
                {t("nav_dashboard")}
              </h1>
              <span
                className="px-2 py-0.5 rounded-full text-xs font-bold"
                style={{ background: "#fef3c7", color: "#92400e" }}
              >
                {selectedPool.name}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <PoolSelector pools={poolSelectorList} currentPoolId={poolId} />
              <JoinLeagueButton />
            </div>
          </div>
          <Link
            href="/quiniela/new"
            className="flex-shrink-0 flex items-center gap-1.5 py-2 px-4 rounded-lg font-bold text-sm hover:opacity-90 transition-opacity"
            style={{ background: "#F5C518", color: "#1a1a00" }}
          >
            <span>+</span>
            <span className="hidden sm:inline">{t("new_quiniela")}</span>
            <span className="sm:hidden">{t("new")}</span>
          </Link>
        </div>

        {/* ── Pozo strip ───────────────────────────────────────────── */}
        {(totalQ > 0 || isPhysicalPrize) && (
          <div
            className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 rounded-xl text-xs"
            style={{ background: "#0d1f11", border: "1px solid #2a5438" }}
          >
            {isPhysicalPrize ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[#F5C518] font-black uppercase tracking-wider">Premios</span>
                  <span className="text-[#2a5438]">·</span>
                  <span className="text-[#7ab88a]">{totalQ} quiniela{totalQ !== 1 ? "s" : ""}</span>
                </div>
                <span className="text-[#2a5438] hidden sm:inline">|</span>
                {[
                  { icon: "🥇", label: "1º", value: prize1st },
                  { icon: "🥈", label: "2º", value: prize2nd },
                  { icon: "🥉", label: "3º", value: prize3rd },
                ].map(({ icon, label, value }) => (
                  <div key={label} className="flex items-center gap-1">
                    <span>{icon}</span>
                    <span className="text-[#7ab88a]">{label}:</span>
                    <span className="text-white font-semibold">{value ?? "Por definir"}</span>
                  </div>
                ))}
                {mySubmittedCount > 0 && (
                  <div className="w-full flex items-center gap-2 text-xs" style={{ borderTop: "1px solid #2a5438", paddingTop: "6px", marginTop: "2px" }}>
                    <span className="text-[#7ab88a]">Tus quinielas:</span>
                    <span className="text-white font-semibold">{mySubmittedCount}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[#F5C518] font-black uppercase tracking-wider">{t("prize_pool")}</span>
                  <span className="text-white font-black">${pool.toFixed(0)}</span>
                  <span className="text-[#4a7a5a]">{currency}</span>
                  <span className="text-[#2a5438]">·</span>
                  <span className="text-[#7ab88a]">{totalQ} quiniela{totalQ !== 1 ? "s" : ""}</span>
                </div>
                <span className="text-[#2a5438] hidden sm:inline">|</span>
                {[
                  { icon: "🥇", label: "1°", amount: prizes.first },
                  { icon: "🥈", label: "2°", amount: prizes.second },
                  { icon: "🥉", label: "3°", amount: prizes.third },
                  { icon: "🎟️", label: t("prize_last"), amount: prizes.last },
                ].map(p => (
                  <div key={p.label} className="flex items-center gap-1">
                    <span>{p.icon}</span>
                    <span className="text-[#7ab88a]">{p.label}:</span>
                    <span className="text-white font-semibold">${p.amount.toFixed(0)}</span>
                  </div>
                ))}
                {mySubmittedCount > 0 && (
                  <div className="w-full flex items-center gap-2 text-xs" style={{ borderTop: "1px solid #2a5438", paddingTop: "6px", marginTop: "2px" }}>
                    <span className="text-[#7ab88a]">Tus quinielas:</span>
                    <span className="text-white font-semibold">{mySubmittedCount}</span>
                    <span className="text-[#2a5438]">·</span>
                    <span className="text-[#7ab88a]">Total a pagar:</span>
                    <span className="text-[#F5C518] font-black">${userOwes.toFixed(0)} {currency}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Fixture tickers ──────────────────────────────────────── */}
        {(recentFixtures.length > 0 || upcomingFixtures.length > 0) && (
          <div className="space-y-3">
            {recentFixtures.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <SectionLabel>{t("recent_results")}</SectionLabel>
                  <Link href="/grupos" className="text-xs font-medium hover:underline" style={{ color: "#6b7280" }}>
                    {t("view_all")}
                  </Link>
                </div>
                <RecentFixtureTicker items={recentFixtures} />
              </div>
            )}
            {upcomingFixtures.length > 0 && (
              <div>
                <SectionLabel>{t("upcoming")}</SectionLabel>
                <UpcomingFixtureTicker items={upcomingFixtures} />
              </div>
            )}
          </div>
        )}

        {/* ── Full-width leaderboard ────────────────────────────────── */}
        <div>
          <SectionLabel>{t("standings")}</SectionLabel>
          <LeaderboardClient
            quinielas={enrichedQuinielas}
            myQuinielas={myQuinielas}
            currentUserId={user.id}
            teamFlagsRecord={teamFlagsRecord}
          />
        </div>

        {/* ── Bonus summary tables (side-by-side on desktop) ───────── */}
        {(topScorer.length > 0 || topGoals.length > 0) && (
          <div className="flex flex-col sm:flex-row gap-4">
            <BonusTable
              icon="⚽"
              label={t("bonus_scorer_lbl")}
              picks={topScorer}
              total={totalQ}
            />
            <BonusTable
              icon="🎯"
              label={t("bonus_goals_lbl")}
              picks={topGoals}
              total={totalQ}
              flagMap={teamFlagMap}
            />
          </div>
        )}

      </div>
    </div>
  )
}
