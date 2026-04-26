import { createClient } from "@/lib/supabase-server"
import { redirect } from "next/navigation"
import Navbar from "@/components/Navbar"
import Link from "next/link"
import type { Fixture, GroupStanding } from "@/lib/types"
import { getServerT } from "@/lib/server-lang"

export const dynamic = "force-dynamic"

export default async function GruposPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  const t = await getServerT()

  const PHASE_LABELS: Record<string, string> = {
    round_of_32:   t("phase_r32"),
    round_of_16:   t("phase_r16"),
    quarterfinals: t("phase_qf"),
    semifinals:    t("phase_sf"),
    final:         t("phase_final"),
  }

  // ── Group standings ──────────────────────────────────────────────────
  const { data: standings } = await supabase
    .from("groups")
    .select("*")
    .order("group_name", { ascending: true })
    .order("points", { ascending: false })
    .order("goal_difference", { ascending: false })
    .order("goals_for", { ascending: false })

  // ── Fixtures ────────────────────────────────────────────────────────
  const { data: allFixtures } = await supabase
    .from("fixtures")
    .select("*")
    .order("kickoff", { ascending: true })

  // Group stage
  const groupFixturesRaw = (allFixtures ?? []).filter(f => f.phase === "groups")
  // Knockout stages
  const knockoutFixtures = (allFixtures ?? []).filter(
    f => f.phase && f.phase !== "groups"
  ) as Fixture[]

  // Build maps for group stage
  const groupsMap = new Map<string, GroupStanding[]>()
  standings?.forEach(s => {
    if (!groupsMap.has(s.group_name)) groupsMap.set(s.group_name, [])
    groupsMap.get(s.group_name)!.push(s as GroupStanding)
  })

  const fixturesMap = new Map<string, Fixture[]>()
  groupFixturesRaw.forEach(f => {
    const g = f.group_name ?? "Sin Grupo"
    if (!fixturesMap.has(g)) fixturesMap.set(g, [])
    fixturesMap.get(g)!.push(f as Fixture)
  })

  const allGroups = Array.from(
    new Set([...Array.from(groupsMap.keys()), ...Array.from(fixturesMap.keys())])
  ).sort()

  // Build knockout rounds map: phase → fixtures[]
  const knockoutMap = new Map<string, Fixture[]>()
  knockoutFixtures.forEach(f => {
    const phase = f.phase!
    if (!knockoutMap.has(phase)) knockoutMap.set(phase, [])
    knockoutMap.get(phase)!.push(f)
  })

  const knockoutPhases = ["round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"].filter(
    p => knockoutMap.has(p)
  )

  return (
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />

      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Page header */}
        <div className="mb-6">
          <h1 className="text-xl sm:text-2xl font-black" style={{ color: "#111827" }}>{t("groups_title")}</h1>
          <p className="text-[#6b7280] text-sm mt-1">{t("groups_subtitle").replace("{n}", String(allGroups.length))}</p>
        </div>

        {/* ── Group phase ──────────────────────────────────────────────── */}
        {allGroups.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">⏳</div>
            <p className="font-bold mb-1" style={{ color: "#111827" }}>{t("groups_no_data")}</p>
            <p className="text-[#6b7280] text-sm">{t("groups_no_data_sub")}</p>
          </div>
        ) : (
          <>
            <SectionDivider label={t("groups_phase")} />
            <div className="grid gap-4 md:grid-cols-2">
              {allGroups.map(groupName => {
                const groupStandings = groupsMap.get(groupName) ?? []
                const groupFixtures  = fixturesMap.get(groupName) ?? []

                return (
                  <div
                    key={groupName}
                    className="rounded-xl overflow-hidden"
                    style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
                  >
                    {/* Group header — keeps dark green as accent stripe */}
                    <div
                      className="px-4 py-2.5 flex items-center gap-2"
                      style={{ background: "linear-gradient(90deg, #0d3318, #0d1f11)" }}
                    >
                      <span className="text-[#F5C518] font-black text-sm">⚽</span>
                      <h2 className="font-black text-white text-sm uppercase tracking-wider">{groupName}</h2>
                    </div>

                    {/* Standings table */}
                    {groupStandings.length > 0 && (
                      <>
                        <div
                          className="grid gap-0 px-3 py-1.5 text-[#4b5563] text-xs font-bold uppercase tracking-wider"
                          style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb", gridTemplateColumns: "1fr 28px 28px 28px 28px 32px 36px" }}
                        >
                          <span>{t("col_team")}</span>
                          <span className="text-center">J</span>
                          <span className="text-center">G</span>
                          <span className="text-center">E</span>
                          <span className="text-center">P</span>
                          <span className="text-center">DG</span>
                          <span className="text-center text-[#d97706]">{t("pts")}</span>
                        </div>
                        {groupStandings.map((team, idx) => (
                          <div
                            key={team.id}
                            className={`grid gap-0 px-3 py-2 items-center border-t border-[#f3f4f6] ${idx < 2 ? "bg-[#fffbeb]" : "bg-white"}`}
                            style={{ gridTemplateColumns: "1fr 28px 28px 28px 28px 32px 36px" }}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {idx < 2 && <div className="w-0.5 h-4 rounded-full bg-[#F5C518] flex-shrink-0" />}
                              {idx >= 2 && <div className="w-0.5 h-4 flex-shrink-0" />}
                              {team.team_flag && (
                                <img src={team.team_flag} alt="" className="w-5 h-3.5 object-contain rounded-sm flex-shrink-0" />
                              )}
                              <span className="text-[#111827] text-xs font-medium truncate">{team.team_name}</span>
                            </div>
                            <span className="text-center text-[#374151] text-xs">{team.played}</span>
                            <span className="text-center text-green-600 text-xs font-medium">{team.won}</span>
                            <span className="text-center text-[#d97706] text-xs">{team.drawn}</span>
                            <span className="text-center text-red-500 text-xs">{team.lost}</span>
                            <span className="text-center text-[#374151] text-xs">
                              {team.goal_difference > 0 ? `+${team.goal_difference}` : team.goal_difference}
                            </span>
                            <span className={`text-center font-black text-sm ${idx < 2 ? "text-[#d97706]" : "text-[#111827]"}`}>
                              {team.points}
                            </span>
                          </div>
                        ))}
                      </>
                    )}

                    {/* Group fixtures */}
                    {groupFixtures.length > 0 && (
                      <div className="border-t border-[#e5e7eb]">
                        {groupFixtures.map(f => {
                          const kickoff = f.kickoff
                            ? new Date(f.kickoff).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
                            : "?"
                          const hasResult = f.home_score !== null
                          return (
                            <Link
                              key={f.id}
                              href={`/fixtures/${f.id}`}
                              className="flex items-center gap-2 px-3 py-1.5 border-b border-[#f3f4f6] last:border-0 hover:bg-gray-50 transition-colors"
                            >
                              <span className="text-[#9ca3af] text-xs w-10 text-right flex-shrink-0">{kickoff}</span>
                              <div className="flex items-center gap-1 flex-1 justify-end min-w-0">
                                {f.home_team_flag && (
                                  <img src={f.home_team_flag} alt="" className="w-4 h-3 object-contain flex-shrink-0 rounded-sm" />
                                )}
                                <span className="text-[#111827] text-xs truncate">{f.home_team_name}</span>
                              </div>
                              <div className="flex-shrink-0 text-center min-w-[40px]">
                                {hasResult ? (
                                  <span className="text-[#d97706] text-xs font-black">{f.home_score}–{f.away_score}</span>
                                ) : (
                                  <span className="text-[#9ca3af] text-xs">vs</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-1 min-w-0">
                                {f.away_team_flag && (
                                  <img src={f.away_team_flag} alt="" className="w-4 h-3 object-contain flex-shrink-0 rounded-sm" />
                                )}
                                <span className="text-[#111827] text-xs truncate">{f.away_team_name}</span>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── Knockout rounds ──────────────────────────────────────────── */}
        {knockoutPhases.length > 0 && (
          <div className="mt-8 space-y-6">
            {knockoutPhases.map(phase => {
              const matches = knockoutMap.get(phase)!
              const label = PHASE_LABELS[phase] ?? phase
              return (
                <div key={phase}>
                  <SectionDivider label={label} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {matches.map(f => {
                      const hasResult = f.home_score !== null
                      const kickoff = f.kickoff
                        ? new Date(f.kickoff).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })
                        : null
                      const homeName = f.home_team_name || f.home_placeholder || "TBD"
                      const awayName = f.away_team_name || f.away_placeholder || "TBD"

                      return (
                        <Link
                          key={f.id}
                          href={`/fixtures/${f.id}`}
                          className="rounded-xl px-4 py-3 transition-colors block hover:bg-gray-50"
                          style={{ background: "white", border: "1px solid #d1d5db" }}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
                              {f.home_team_flag && (
                                <img src={f.home_team_flag} alt="" className="w-5 h-3.5 object-contain flex-shrink-0 rounded-sm" />
                              )}
                              <span className={`text-sm truncate font-medium ${hasResult && f.home_score! > f.away_score! ? "text-[#d97706] font-bold" : "text-[#111827]"}`}>
                                {homeName}
                              </span>
                            </div>

                            <div className="flex-shrink-0 text-center min-w-[52px]">
                              {hasResult ? (
                                <div>
                                  <span className="text-[#d97706] font-black text-base">{f.home_score}–{f.away_score}</span>
                                  {f.went_to_penalties && (
                                    <p className="text-[#9ca3af] text-xs mt-0.5">Pen.</p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[#9ca3af] text-sm font-medium">vs</span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              {f.away_team_flag && (
                                <img src={f.away_team_flag} alt="" className="w-5 h-3.5 object-contain flex-shrink-0 rounded-sm" />
                              )}
                              <span className={`text-sm truncate font-medium ${hasResult && f.away_score! > f.home_score! ? "text-[#d97706] font-bold" : "text-[#111827]"}`}>
                                {awayName}
                              </span>
                            </div>
                          </div>
                          {kickoff && !hasResult && (
                            <p className="text-center text-[#9ca3af] text-xs mt-1.5 capitalize">{kickoff}</p>
                          )}
                          {f.went_to_penalties && f.penalties_winner && (
                            <p className="text-center text-[#6b7280] text-xs mt-1">
                              {t("penales")}: {f.penalties_winner === "home" ? homeName : awayName}
                            </p>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-[#374151] text-xs font-bold uppercase tracking-widest whitespace-nowrap">{label}</h2>
      <div className="flex-1 h-px" style={{ background: "#e5e7eb" }} />
    </div>
  )
}
