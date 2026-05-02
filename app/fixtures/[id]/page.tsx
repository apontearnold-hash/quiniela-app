import { createClient } from "@/lib/supabase-server"
import { redirect, notFound } from "next/navigation"
import { apiFetch, getApiKey } from "@/lib/api-football"
import Navbar from "@/components/Navbar"
import Link from "next/link"
import type { Fixture } from "@/lib/types"
import { getServerT } from "@/lib/server-lang"
import TeamContextCard from "@/components/TeamContextCard"
import FixtureTopScorers from "@/components/FixtureTopScorers"

export const dynamic = "force-dynamic"

interface FixtureEvent {
  time:   { elapsed: number; extra: number | null }
  team:   { id: number; name: string; logo: string }
  player: { id: number | null; name: string | null }
  assist: { id: number | null; name: string | null }
  type:   string
  detail: string
}

interface StatItem { type: string; value: string | number | null }
interface TeamStats {
  team:       { id: number; name: string; logo: string }
  statistics: StatItem[]
}

interface PlayerInLineup {
  player: { id: number; name: string; number: number; pos: string; grid: string | null }
}
interface H2HFixture {
  fixture: { id: number; date: string; status: { short: string } }
  teams:   { home: { id: number; name: string; logo: string }; away: { id: number; name: string; logo: string } }
  goals:   { home: number | null; away: number | null }
}
interface TeamLineup {
  team:        { id: number; name: string; logo: string }
  formation:   string
  coach:       { name: string } | null
  startXI:     PlayerInLineup[]
  substitutes: PlayerInLineup[]
}

function parseStatValue(v: string | number | null): number {
  if (v === null || v === undefined) return 0
  if (typeof v === "number") return v
  return parseInt(String(v).replace("%", ""), 10) || 0
}

function eventIcon(type: string, detail: string): string {
  if (type === "Goal") {
    if (detail.toLowerCase().includes("pen")) return "⚽ (P)"
    if (detail.toLowerCase().includes("own")) return "⚽ OG"
    return "⚽"
  }
  if (type === "Card") {
    if (detail.toLowerCase().includes("red"))    return "🟥"
    if (detail.toLowerCase().includes("yellow")) return "🟨"
    return "🃏"
  }
  if (type === "subst") return "🔄"
  return "•"
}

const KEY_STATS = [
  "Ball Possession", "Total Shots", "Shots on Goal",
  "Corner Kicks", "Fouls", "Offsides", "Yellow Cards",
]

function StatBar({ label, homeVal, awayVal }: {
  label: string; homeVal: string | number | null; awayVal: string | number | null
}) {
  const h = parseStatValue(homeVal)
  const a = parseStatValue(awayVal)
  const total = h + a
  const homePct = total > 0 ? Math.round((h / total) * 100) : 50

  return (
    <div className="py-2.5 border-t border-[#e5e7eb] first:border-t-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[#111827] text-sm font-semibold w-10 text-left">{homeVal ?? "—"}</span>
        <span className="text-[#6b7280] text-xs flex-1 text-center">{label}</span>
        <span className="text-[#111827] text-sm font-semibold w-10 text-right">{awayVal ?? "—"}</span>
      </div>
      <div className="flex rounded-full overflow-hidden h-1.5">
        <div style={{ width: `${homePct}%`, background: "#16a34a" }} />
        <div style={{ width: `${100 - homePct}%`, background: "#2563eb" }} />
      </div>
    </div>
  )
}

export default async function FixtureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  const t = await getServerT()

  const fixtureId = parseInt(id, 10)
  const isBracketSlot = fixtureId >= 9000001

  const { data: fixtureRaw } = await supabase
    .from("fixtures")
    .select("*")
    .eq("id", fixtureId)
    .single()

  if (!fixtureRaw && !isBracketSlot) notFound()

  const fixture = fixtureRaw as Fixture | null

  // Derive status before API calls so cache TTL can be set per match state.
  const isNotStarted = fixture?.status === "not_started" || fixture?.status_short === "NS"
  const isFinished   = fixture?.status === "finished"
  const isLive       = fixture?.status === "live"

  // Cache strategy:
  //   live      → no-store (score/events change every minute)
  //   finished  → 86400s  (result is immutable)
  //   not yet   → 3600s   (probable lineups may appear a few hours before KO)
  const detailsCacheOpts = isLive
    ? undefined
    : isFinished
    ? { revalidate: 86400 }
    : { revalidate: 3600 }

  let events:     FixtureEvent[]  = []
  let statistics: TeamStats[]     = []
  let lineups:    TeamLineup[]    = []
  let h2h:        H2HFixture[]    = []
  let apiError:   string | null   = null

  if (!isBracketSlot && getApiKey() && fixture) {
    try {
      const [evRes, stRes, liRes] = await Promise.all([
        apiFetch(`/fixtures/events?fixture=${fixtureId}`,    detailsCacheOpts),
        apiFetch(`/fixtures/statistics?fixture=${fixtureId}`, detailsCacheOpts),
        apiFetch(`/fixtures/lineups?fixture=${fixtureId}`,   detailsCacheOpts),
      ])
      const [evData, stData, liData] = await Promise.all([
        evRes.json(), stRes.json(), liRes.json(),
      ])
      events     = evData.response  ?? []
      statistics = stData.response  ?? []
      lineups    = liData.response  ?? []
    } catch (err) {
      apiError = err instanceof Error ? err.message : "Error loading details"
    }
  }

  if (!isBracketSlot && getApiKey() && fixture?.home_team_id && fixture?.away_team_id) {
    try {
      const h2hRes = await apiFetch(
        `/fixtures/headtohead?h2h=${fixture.home_team_id}-${fixture.away_team_id}&last=5`,
        { revalidate: 86400 },
      )
      if (h2hRes.ok) {
        const h2hData = await h2hRes.json()
        h2h = h2hData.response ?? []
      }
    } catch { /* h2h is informational only */ }
  }

  function statusLabel(short: string | null, elapsed: number | null): string {
    if (!short) return ""
    const map: Record<string, string> = {
      FT: t("fixture_final"), AET: t("fixture_final_et"), PEN: t("fixture_final_pen"),
      HT: t("fixture_ht"), NS: t("fixture_ns"),
      CANC: t("fixture_cancelled"), PST: t("fixture_postponed"),
    }
    if (map[short]) return map[short]
    if (["1H", "2H", "ET"].includes(short)) return elapsed ? `${elapsed}'` : t("fixture_live")
    return short
  }

  const STAT_LABELS: Record<string, string> = {
    "Ball Possession": t("fixture_possession"),
    "Total Shots":     t("fixture_shots"),
    "Shots on Goal":   t("fixture_shots_target"),
    "Corner Kicks":    t("fixture_corners"),
    "Fouls":           t("fixture_fouls"),
    "Offsides":        t("fixture_offsides"),
    "Yellow Cards":    t("fixture_yellows"),
  }

  const posLabels: Record<string, string> = {
    G: t("fixture_gk"), D: t("fixture_def"), M: t("fixture_mid"), F: t("fixture_fwd"),
  }

  const statusStyle = isLive
    ? { background: "rgba(239,68,68,0.1)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.3)" }
    : isFinished
    ? { background: "rgba(22,163,74,0.1)", color: "#16a34a", border: "1px solid rgba(22,163,74,0.3)" }
    : { background: "#f3f4f6", color: "#6b7280", border: "1px solid #d1d5db" }

  const cardStyle = { background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }

  return (
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />

      <div className="max-w-3xl mx-auto px-4 py-6">

        <Link href="/mundial" className="inline-flex items-center gap-1 text-[#6b7280] text-sm hover:text-[#111827] mb-5 transition-colors">
          ← Volver al Mundial
        </Link>

        {/* ══ Match header — stays dark as accent ══════════════════════ */}
        <div
          className="rounded-2xl p-5 mb-6"
          style={{ background: "linear-gradient(135deg, #0d1f11, #152a1a)", border: "1px solid #2a5438" }}
        >
          {isBracketSlot ? (
            <div className="text-center py-4">
              <p className="text-white font-bold text-lg">{t("fixture_tbd")}</p>
              <p className="text-[#7ab88a] text-sm mt-1">
                {fixture?.home_placeholder ?? "TBD"} vs {fixture?.away_placeholder ?? "TBD"}
              </p>
            </div>
          ) : fixture ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col items-center gap-2 flex-1 text-center">
                  {fixture.home_team_flag && (
                    <img src={fixture.home_team_flag} alt="" className="w-12 h-9 object-contain" />
                  )}
                  <span className="text-white font-bold text-sm leading-tight">{fixture.home_team_name}</span>
                </div>

                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  {isNotStarted ? (
                    <>
                      <span className="text-2xl font-black" style={{ color: "#F5C518", fontVariantNumeric: "tabular-nums" }}>
                        {fixture.kickoff
                          ? new Date(fixture.kickoff).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </span>
                      <span className="text-[#7ab88a] text-xs">
                        {fixture.kickoff
                          ? new Date(fixture.kickoff).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
                          : ""}
                      </span>
                    </>
                  ) : (
                    <span className="text-4xl font-black tracking-wider" style={{ color: "#F5C518", fontVariantNumeric: "tabular-nums" }}>
                      {fixture.home_score ?? "—"} — {fixture.away_score ?? "—"}
                    </span>
                  )}

                  <span className="text-xs font-bold px-2 py-0.5 rounded-full mt-1" style={statusStyle}>
                    {isLive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 mr-1 animate-pulse" />}
                    {statusLabel(fixture.status_short, fixture.elapsed)}
                  </span>

                  {fixture.went_to_penalties && fixture.penalty_home !== null && (
                    <span className="text-[#7ab88a] text-xs mt-0.5">
                      {t("penales")}: {fixture.penalty_home} – {fixture.penalty_away}
                    </span>
                  )}
                </div>

                <div className="flex flex-col items-center gap-2 flex-1 text-center">
                  {fixture.away_team_flag && (
                    <img src={fixture.away_team_flag} alt="" className="w-12 h-9 object-contain" />
                  )}
                  <span className="text-white font-bold text-sm leading-tight">{fixture.away_team_name}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
                {fixture.group_name && <span className="text-[#7ab88a] text-xs">{fixture.group_name}</span>}
                {fixture.round && <span className="text-[#7ab88a] text-xs">· {fixture.round}</span>}
                {fixture.venue_name && <span className="text-[#7ab88a] text-xs">· 📍 {fixture.venue_name}</span>}
                {fixture.venue_city && <span className="text-[#7ab88a] text-xs">{fixture.venue_city}</span>}
              </div>
            </>
          ) : null}
        </div>

        {apiError && (
          <div className="mb-4 px-4 py-3 rounded-xl text-sm" style={{ background: "#fff7ed", border: "1px solid #fed7aa", color: "#92400e" }}>
            {apiError}
          </div>
        )}

        {!getApiKey() && !isBracketSlot && (
          <div className="mb-6 px-4 py-3 rounded-xl text-sm" style={{ background: "#f9fafb", border: "1px solid #d1d5db", color: "#6b7280" }}>
            {t("fixture_no_api_key")}
          </div>
        )}

        {/* ══ Team qualifier context — auto-discovers confederation ══ */}
        {!isBracketSlot && fixture && fixture.phase === "groups" &&
          (fixture.home_team_id || fixture.away_team_id) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            {fixture.home_team_id && (
              <TeamContextCard
                teamId={fixture.home_team_id}
                teamName={fixture.home_team_name ?? ""}
                teamFlag={fixture.home_team_flag}
              />
            )}
            {fixture.away_team_id && (
              <TeamContextCard
                teamId={fixture.away_team_id}
                teamName={fixture.away_team_name ?? ""}
                teamFlag={fixture.away_team_flag}
              />
            )}
          </div>
        )}

        {/* ══ Qualifying top scorers (shared section, clearly labeled) ══ */}
        {!isBracketSlot && fixture?.phase === "groups" &&
          fixture.home_team_id && fixture.away_team_id && (
          <FixtureTopScorers
            homeTeamId={fixture.home_team_id}
            awayTeamId={fixture.away_team_id}
          />
        )}

        {/* ══ Head-to-head ════════════════════════════════════════════ */}
        {!isBracketSlot && fixture && getApiKey() &&
          fixture.home_team_id && fixture.away_team_id && (
          <div className="rounded-2xl p-5 mb-5" style={cardStyle}>
            <SectionTitle label="Enfrentamientos recientes" />
            {h2h.length === 0 ? (
              <p className="text-[#9ca3af] text-sm text-center py-4">
                No hay enfrentamientos recientes disponibles.
              </p>
            ) : (
              <div className="flex flex-col gap-0">
                {h2h.map((m) => {
                  const d = new Date(m.fixture.date)
                  const dateLabel = d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
                  return (
                    <div key={m.fixture.id} className="flex items-center gap-3 py-2.5 border-t border-[#f3f4f6] first:border-t-0">
                      <span className="text-[#9ca3af] text-xs flex-shrink-0 w-[90px]">{dateLabel}</span>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {m.teams.home.logo && (
                          <img src={m.teams.home.logo} alt="" className="w-4 h-4 object-contain flex-shrink-0" />
                        )}
                        <span className="text-[#111827] text-xs font-semibold truncate">{m.teams.home.name}</span>
                      </div>
                      <span className="text-sm font-black flex-shrink-0 tabular-nums" style={{ color: "#F5C518" }}>
                        {m.goals.home ?? "–"}&nbsp;–&nbsp;{m.goals.away ?? "–"}
                      </span>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                        <span className="text-[#111827] text-xs font-semibold truncate text-right">{m.teams.away.name}</span>
                        {m.teams.away.logo && (
                          <img src={m.teams.away.logo} alt="" className="w-4 h-4 object-contain flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ Events ══════════════════════════════════════════════════ */}
        {!isBracketSlot && !isNotStarted && (
          <div className="rounded-2xl p-5 mb-5" style={cardStyle}>
            <SectionTitle label={t("fixture_events")} />

            {events.length === 0 ? (
              <p className="text-[#9ca3af] text-sm text-center py-6">{t("fixture_no_events")}</p>
            ) : (
              <div className="flex flex-col gap-0">
                {events.map((ev, i) => {
                  const isHome = fixture?.home_team_id === ev.team.id
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-3 py-2.5 border-t border-[#f3f4f6] first:border-t-0 ${isHome ? "" : "flex-row-reverse"}`}
                    >
                      <span className="text-[#d97706] text-xs font-black w-8 flex-shrink-0 text-center mt-0.5">
                        {ev.time.elapsed}{ev.time.extra ? `+${ev.time.extra}` : ""}&apos;
                      </span>
                      <span className="text-sm flex-shrink-0">{eventIcon(ev.type, ev.detail)}</span>
                      <div className={`flex-1 min-w-0 ${isHome ? "" : "text-right"}`}>
                        {ev.type === "subst" ? (
                          <>
                            <p className="text-[#111827] text-sm leading-tight">↑ {ev.assist?.name ?? "—"}</p>
                            <p className="text-[#9ca3af] text-xs leading-tight">↓ {ev.player?.name ?? "—"}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-[#111827] text-sm leading-tight">{ev.player?.name ?? "—"}</p>
                            {ev.assist?.name && (
                              <p className="text-[#6b7280] text-xs leading-tight">{t("fixture_assist")} {ev.assist.name}</p>
                            )}
                            {ev.detail && ev.detail !== "Normal Goal" && (
                              <p className="text-[#6b7280] text-xs leading-tight">{ev.detail}</p>
                            )}
                          </>
                        )}
                        <p className="text-[#9ca3af] text-xs leading-tight mt-0.5">{ev.team.name}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ Statistics ══════════════════════════════════════════════ */}
        {!isBracketSlot && !isNotStarted && (
          <div className="rounded-2xl p-5 mb-5" style={cardStyle}>
            <SectionTitle label={t("fixture_stats")} />

            {statistics.length < 2 ? (
              <p className="text-[#9ca3af] text-sm text-center py-6">{t("fixture_no_stats")}</p>
            ) : (() => {
              const homeStats = statistics.find(s => s.team.id === fixture?.home_team_id) ?? statistics[0]
              const awayStats = statistics.find(s => s.team.id === fixture?.away_team_id) ?? statistics[1]
              const homeStatMap = new Map(homeStats.statistics.map(s => [s.type, s.value]))
              const awayStatMap = new Map(awayStats.statistics.map(s => [s.type, s.value]))

              return (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {fixture?.home_team_flag && <img src={fixture.home_team_flag} alt="" className="w-5 h-3.5 object-contain" />}
                      <span className="text-[#111827] text-xs font-bold">{fixture?.home_team_name}</span>
                      <span className="w-3 h-1.5 rounded-full inline-block" style={{ background: "#16a34a" }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-1.5 rounded-full inline-block" style={{ background: "#2563eb" }} />
                      <span className="text-[#111827] text-xs font-bold">{fixture?.away_team_name}</span>
                      {fixture?.away_team_flag && <img src={fixture.away_team_flag} alt="" className="w-5 h-3.5 object-contain" />}
                    </div>
                  </div>
                  {KEY_STATS.map(stat => {
                    const hv = homeStatMap.get(stat) ?? null
                    const av = awayStatMap.get(stat) ?? null
                    if (hv === null && av === null) return null
                    return <StatBar key={stat} label={STAT_LABELS[stat] ?? stat} homeVal={hv} awayVal={av} />
                  })}
                </div>
              )
            })()}
          </div>
        )}

        {/* ══ Lineups ══════════════════════════════════════════════════ */}
        {!isBracketSlot && lineups.length > 0 && (
          <div className="rounded-2xl p-5 mb-5" style={cardStyle}>
            <SectionTitle label={t("fixture_lineups")} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {lineups.map((lineup, li) => {
                const isHomeTeam = lineup.team.id === fixture?.home_team_id
                const accentColor = isHomeTeam ? "#16a34a" : "#2563eb"

                const byPos: Record<string, PlayerInLineup[]> = { G: [], D: [], M: [], F: [] }
                for (const p of lineup.startXI) {
                  const pos = p.player.pos ?? "F"
                  if (!byPos[pos]) byPos[pos] = []
                  byPos[pos].push(p)
                }

                return (
                  <div key={li}>
                    <div className="flex items-center gap-2 mb-3">
                      {lineup.team.logo && <img src={lineup.team.logo} alt="" className="w-6 h-6 object-contain" />}
                      <div>
                        <p className="text-[#111827] text-sm font-bold">{lineup.team.name}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded"
                            style={{ background: `${accentColor}20`, color: accentColor }}>
                            {lineup.formation}
                          </span>
                          {lineup.coach?.name && <span className="text-[#6b7280] text-xs">{lineup.coach.name}</span>}
                        </div>
                      </div>
                    </div>

                    {["G", "D", "M", "F"].map(pos => {
                      const players = byPos[pos]
                      if (!players?.length) return null
                      return (
                        <div key={pos} className="mb-3">
                          <p className="text-[#9ca3af] text-xs uppercase tracking-wider mb-1">{posLabels[pos]}</p>
                          {players.map(({ player }) => (
                            <div key={player.id} className="flex items-center gap-2 py-1 border-t border-[#f3f4f6] first:border-t-0">
                              <span className="text-xs font-black w-6 text-center flex-shrink-0" style={{ color: accentColor }}>
                                {player.number}
                              </span>
                              <span className="text-[#111827] text-xs">{player.name}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })}

                    {lineup.substitutes.length > 0 && (
                      <div>
                        <p className="text-[#9ca3af] text-xs uppercase tracking-wider mb-1">{t("fixture_bench")}</p>
                        <div className="flex flex-wrap gap-1">
                          {lineup.substitutes.map(({ player }) => (
                            <span key={player.id} className="text-xs px-2 py-0.5 rounded"
                              style={{ background: "#f3f4f6", color: "#374151" }}>
                              {player.number}. {player.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══ Not started ════════════════════════════════════════════ */}
        {!isBracketSlot && isNotStarted && (
          <div className="rounded-2xl p-8 text-center" style={cardStyle}>
            <p className="text-5xl mb-3">⏳</p>
            <p className="text-[#111827] font-bold text-lg">{t("fixture_coming")}</p>
            {fixture?.kickoff && (
              <p className="text-[#6b7280] text-sm mt-2">
                {new Date(fixture.kickoff).toLocaleDateString("es-MX", {
                  weekday: "long", day: "numeric", month: "long", year: "numeric",
                })}
                {" · "}
                {new Date(fixture.kickoff).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
            <p className="text-[#9ca3af] text-xs mt-3">{t("fixture_coming_info")}</p>
          </div>
        )}

      </div>
    </div>
  )
}

function SectionTitle({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <h2 className="text-[#374151] font-bold text-xs uppercase tracking-widest">{label}</h2>
      <div className="flex-1 h-px" style={{ background: "#e5e7eb" }} />
    </div>
  )
}
