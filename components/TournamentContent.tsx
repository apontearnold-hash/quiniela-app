"use client"

import { useEffect, useState } from "react"
import { useT } from "@/components/LangProvider"
import type { TournamentFixture, GroupStanding, StandingEntry } from "@/app/api/tournament/data/route"

// ── Match status helpers ──────────────────────────────────────────────────────

const LIVE_STATUSES = new Set(["1H", "2H", "HT", "ET", "P", "BT"])
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"])

function statusLabel(status: { short: string; elapsed: number | null }): { text: string; live: boolean; finished: boolean } {
  const live     = LIVE_STATUSES.has(status.short)
  const finished = FINISHED_STATUSES.has(status.short)
  let text = status.short
  if (status.short === "HT")  text = "HT"
  else if (status.short === "NS") text = ""
  else if (status.elapsed)    text = `${status.elapsed}′`
  return { text, live, finished }
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("es-MX", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MatchCard({ m }: { m: TournamentFixture }) {
  const st = statusLabel(m.status)
  const hasPen = m.penalty.home !== null

  return (
    <div className="rounded-xl p-3 bg-white shadow-sm"
      style={{ border: `1px solid ${st.live ? "#fbbf24" : "#e5e7eb"}` }}>
      {/* Round + status */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-400 text-xs truncate">{m.round}</span>
        {st.live
          ? <span className="text-xs font-bold text-amber-500 animate-pulse">{st.text || "LIVE"}</span>
          : st.finished
          ? <span className="text-xs font-bold text-green-600">FT{hasPen ? " (P)" : ""}</span>
          : <span className="text-gray-400 text-xs">{formatDate(m.date)}</span>
        }
      </div>
      {/* Teams + score */}
      <div className="flex items-center gap-2">
        {/* Home */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {m.home.logo
            ? <img src={m.home.logo} alt={m.home.name} className="w-6 h-6 object-contain" />
            : <span className="w-6 h-6 rounded-full bg-gray-200" />
          }
          <span className={`text-sm truncate ${m.home.winner ? "text-gray-900 font-bold" : "text-gray-600"}`}>{m.home.name}</span>
        </div>
        {/* Score */}
        <div className="flex items-center gap-1 px-2 flex-shrink-0">
          {(st.finished || st.live)
            ? <>
                <span className={`text-lg font-black min-w-[1.25rem] text-center ${m.home.winner ? "text-gray-900" : "text-gray-500"}`}>
                  {m.goals.home ?? 0}
                </span>
                <span className="text-gray-400 font-bold">–</span>
                <span className={`text-lg font-black min-w-[1.25rem] text-center ${m.away.winner ? "text-gray-900" : "text-gray-500"}`}>
                  {m.goals.away ?? 0}
                </span>
              </>
            : <span className="text-gray-400 font-bold text-sm">vs</span>
          }
        </div>
        {/* Away */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
          <span className={`text-sm truncate text-right ${m.away.winner ? "text-gray-900 font-bold" : "text-gray-600"}`}>{m.away.name}</span>
          {m.away.logo
            ? <img src={m.away.logo} alt={m.away.name} className="w-6 h-6 object-contain" />
            : <span className="w-6 h-6 rounded-full bg-gray-200" />
          }
        </div>
      </div>
      {/* Penalty score */}
      {hasPen && (
        <p className="text-center text-gray-400 text-xs mt-1">Penales: {m.penalty.home} – {m.penalty.away}</p>
      )}
    </div>
  )
}

function StandingRow({ e, highlight }: { e: StandingEntry; highlight: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${highlight ? "bg-green-50" : ""}`}>
      <span className="w-5 text-center font-bold" style={{ color: e.rank <= 2 ? "#d97706" : "#9ca3af" }}>{e.rank}</span>
      {e.team.logo
        ? <img src={e.team.logo} alt={e.team.name} className="w-5 h-5 object-contain" />
        : <span className="w-5 h-5 rounded-full bg-gray-200" />
      }
      <span className="flex-1 text-gray-900 truncate font-medium">{e.team.name}</span>
      <span className="w-6 text-center text-gray-500">{e.played}</span>
      <span className="w-6 text-center text-green-600">{e.win}</span>
      <span className="w-6 text-center text-gray-500">{e.draw}</span>
      <span className="w-6 text-center text-red-500">{e.lose}</span>
      <span className="w-10 text-center text-gray-500">{e.goalsFor}:{e.goalsAgainst}</span>
      <span className="w-6 text-center font-black text-amber-600">{e.points}</span>
    </div>
  )
}

function GroupCard({ g }: { g: GroupStanding }) {
  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
      <div className="px-3 py-2 flex items-center justify-between bg-gray-50">
        <span className="text-gray-900 font-black text-sm">{g.group}</span>
        <div className="flex gap-2 text-gray-400 text-xs">
          <span className="w-6 text-center">J</span>
          <span className="w-6 text-center">G</span>
          <span className="w-6 text-center">E</span>
          <span className="w-6 text-center">P</span>
          <span className="w-10 text-center">GF:GC</span>
          <span className="w-6 text-center">Pts</span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 p-1 bg-white">
        {g.entries.map(e => (
          <StandingRow key={e.team.id} e={e} highlight={e.rank <= 2} />
        ))}
      </div>
    </div>
  )
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type Tab = "live" | "fixtures" | "standings"

interface TournamentData {
  live: TournamentFixture[]
  upcoming: TournamentFixture[]
  standings: GroupStanding[]
  error?: string
}

export default function TournamentContent() {
  const t = useT()
  const [tab, setTab]     = useState<Tab>("live")
  const [data, setData]   = useState<TournamentData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch("/api/tournament/data?type=all")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => { setData({ live: [], upcoming: [], standings: [], error: "fetch_failed" }); setLoading(false) })
  }, [])

  const noApiKey = data?.error === "no_api_key"

  const TABS: { id: Tab; label: string }[] = [
    { id: "live",      label: t("tournament_tab_live") },
    { id: "fixtures",  label: t("tournament_tab_fixtures") },
    { id: "standings", label: t("tournament_tab_standings") },
  ]

  const liveMatches    = data?.live     ?? []
  const upcomingMatches= data?.upcoming ?? []
  const standings      = data?.standings?? []

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-4xl">🌍</span>
          <div>
            <h1 className="text-3xl font-black text-gray-900">{t("tournament_page_title")}</h1>
            <p className="text-gray-600 text-sm mt-0.5">{t("tournament_page_subtitle")}</p>
          </div>
        </div>
      </div>

      {/* Disclaimer banner */}
      <div className="rounded-xl px-4 py-3 mb-6 flex items-center gap-2"
        style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
        <span className="text-amber-600 flex-shrink-0">ℹ</span>
        <p className="text-amber-700 text-sm">{t("tournament_disclaimer")}</p>
      </div>

      {/* No API key notice */}
      {noApiKey && (
        <div className="rounded-xl px-4 py-5 text-center mb-6 bg-white border border-gray-200 shadow-sm">
          <span className="text-4xl block mb-2">🔑</span>
          <p className="text-gray-900 font-semibold">{t("tournament_no_api_key")}</p>
          <p className="text-gray-500 text-xs mt-2">
            Set <code className="text-gray-700">FOOTBALL_API_KEY</code> or <code className="text-gray-700">API_FOOTBALL_KEY</code> in your <code className="text-gray-700">.env.local</code> to enable live tournament data.
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1.5 mb-5">
        {TABS.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
              tab === tb.id
                ? "text-white"
                : "text-gray-600 border border-gray-200 hover:border-gray-400 hover:text-gray-900 bg-white"
            }`}
            style={tab === tb.id ? { background: "#111827" } : {}}>
            {tb.label}
            {tb.id === "live" && liveMatches.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-black text-white"
                style={{ background: "#ef4444" }}>
                {liveMatches.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-20">
          <div className="text-3xl mb-3 animate-spin">⚽</div>
          <p className="text-gray-500">{t("tournament_loading")}</p>
        </div>
      ) : (
        <>
          {/* Live tab */}
          {tab === "live" && (
            <div>
              {liveMatches.length === 0 ? (
                <div className="rounded-2xl p-10 text-center bg-white border border-gray-200 shadow-sm">
                  <span className="text-5xl block mb-3">📡</span>
                  <p className="text-gray-900 font-semibold">{t("tournament_no_live")}</p>
                  {upcomingMatches.length > 0 && (
                    <p className="text-gray-500 text-sm mt-2">
                      {t("tournament_upcoming_lbl")} →{" "}
                      <button onClick={() => setTab("fixtures")} className="underline text-amber-600">
                        {t("tournament_tab_fixtures")}
                      </button>
                    </p>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {liveMatches.map(m => <MatchCard key={m.id} m={m} />)}
                </div>
              )}
            </div>
          )}

          {/* Fixtures tab */}
          {tab === "fixtures" && (
            <div>
              {upcomingMatches.length === 0 ? (
                <div className="rounded-2xl p-10 text-center bg-white border border-gray-200 shadow-sm">
                  <span className="text-5xl block mb-3">🗓️</span>
                  <p className="text-gray-900 font-semibold">{t("tournament_no_data")}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {upcomingMatches.map(m => <MatchCard key={m.id} m={m} />)}
                </div>
              )}
            </div>
          )}

          {/* Standings tab */}
          {tab === "standings" && (
            <div>
              {standings.length === 0 ? (
                <div className="rounded-2xl p-10 text-center bg-white border border-gray-200 shadow-sm">
                  <span className="text-5xl block mb-3">📋</span>
                  <p className="text-gray-900 font-semibold">{t("tournament_no_data")}</p>
                  <p className="text-gray-500 text-sm mt-2">
                    {t("tournament_page_subtitle")}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {standings.map(g => <GroupCard key={g.group} g={g} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
