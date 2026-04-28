"use client"

import { useEffect, useState } from "react"

// ── Types (mirror endpoint response) ─────────────────────────────────────────

interface Competition {
  leagueId:      number
  season:        number
  name:          string
  confederation: string
}

interface Standing {
  rank:      number
  points:    number
  goalsDiff: number
  form:      string | null
  all:       { played: number; win: number; draw: number; lose: number; goals: { for: number; against: number } }
}

interface RecentFixture {
  fixtureId:    number
  date:         string
  isHome:       boolean
  opponent:     { id: number; name: string; logo: string }
  goalsFor:     number | null
  goalsAgainst: number | null
  result:       "W" | "D" | "L" | null
}

interface TopScorer {
  id:    number
  name:  string
  photo: string
  team:  string
  goals: number
}

interface TeamContext {
  found:          boolean
  competition:    Competition | null
  standing:       Standing | null
  recentFixtures: RecentFixture[]
  topScorers:     TopScorer[]
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  teamId:    number
  teamName:  string
  teamFlag?: string | null
  /** Optional override: skip auto-discovery and use this specific league. */
  league?:   number
  season?:   number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const RESULT_STYLE: Record<"W" | "D" | "L", { bg: string; color: string }> = {
  W: { bg: "#dcfce7", color: "#15803d" },
  D: { bg: "#f3f4f6", color: "#4b5563" },
  L: { bg: "#fee2e2", color: "#dc2626" },
}

// Rank considered "qualified" threshold per confederation (approx):
// CONMEBOL top 6, UEFA top ~12, AFC top ~8, CAF top ~9, CONCACAF top ~6, OFC top 1
const QUALIFIED_RANKS: Record<string, number> = {
  CONMEBOL: 6,
  UEFA:     12,
  AFC:      8,
  CAF:      9,
  CONCACAF: 6,
  OFC:      1,
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TeamContextCard({ teamId, teamName, teamFlag, league, season }: Props) {
  const [data, setData]       = useState<TeamContext | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const qs = league && season ? `?league=${league}&season=${season}` : ""
    fetch(`/api/teams/${teamId}/context${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setData(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [teamId, league, season])

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        background: "white", border: "1px solid #e5e7eb", borderRadius: "16px",
        padding: "16px", minHeight: "120px", display: "flex", flexDirection: "column", gap: "10px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {teamFlag && <img src={teamFlag} alt="" style={{ width: "20px", height: "14px", objectFit: "contain", borderRadius: "2px" }} />}
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#111827" }}>{teamName}</span>
        </div>
        <div style={{ background: "#f3f4f6", borderRadius: "8px", height: "12px", width: "60%", animation: "pulse 1.5s infinite" }} />
        <div style={{ background: "#f3f4f6", borderRadius: "8px", height: "10px", width: "40%", animation: "pulse 1.5s infinite" }} />
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
      </div>
    )
  }

  // Team not found in any known competition — render nothing silently
  if (!data || !data.found) return null

  const { competition, standing, recentFixtures, topScorers } = data

  const qualThreshold = competition
    ? (QUALIFIED_RANKS[competition.confederation] ?? 6)
    : 6

  const isInQualZone = standing ? standing.rank <= qualThreshold : false

  return (
    <div style={{
      background: "white", border: "1px solid #e5e7eb", borderRadius: "16px",
      padding: "16px", display: "flex", flexDirection: "column", gap: "12px",
    }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {teamFlag && (
          <img src={teamFlag} alt="" style={{ width: "22px", height: "16px", objectFit: "contain", borderRadius: "3px", flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "13px", fontWeight: 800, color: "#111827", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {teamName}
          </p>
          {competition && (
            <p style={{ fontSize: "10px", color: "#6b7280", margin: 0, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {competition.name}
            </p>
          )}
        </div>

        {standing && (
          <div style={{
            background: isInQualZone ? "#fef9c3" : "#f3f4f6",
            color:      isInQualZone ? "#a16207" : "#374151",
            borderRadius: "8px", padding: "4px 10px",
            fontSize: "13px", fontWeight: 800, flexShrink: 0,
          }}>
            #{standing.rank} · {standing.points} pts
          </div>
        )}
      </div>

      {/* ── Stats row (only when standings available) ── */}
      {standing && (
        <div style={{ display: "flex", gap: "6px", justifyContent: "space-between" }}>
          {[
            { label: "J",  value: standing.all.played },
            { label: "G",  value: standing.all.win },
            { label: "E",  value: standing.all.draw },
            { label: "P",  value: standing.all.lose },
            { label: "GF", value: standing.all.goals.for },
            { label: "GC", value: standing.all.goals.against },
            { label: "DG", value: standing.goalsDiff > 0 ? `+${standing.goalsDiff}` : standing.goalsDiff },
          ].map(({ label, value }) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: 700, textTransform: "uppercase" }}>{label}</span>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#111827" }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Recent fixtures ── */}
      {recentFixtures.length > 0 && (
        <div>
          <p style={{ fontSize: "10px", color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>
            Últimos {recentFixtures.length} partidos
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {recentFixtures.map((fx) => {
              const rs    = fx.result ? RESULT_STYLE[fx.result] : { bg: "#f3f4f6", color: "#4b5563" }
              const score = fx.goalsFor !== null && fx.goalsAgainst !== null
                ? (fx.isHome ? `${fx.goalsFor}–${fx.goalsAgainst}` : `${fx.goalsAgainst}–${fx.goalsFor}`)
                : "–"
              return (
                <div key={fx.fixtureId} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{
                    ...rs, width: "20px", height: "20px", borderRadius: "6px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "10px", fontWeight: 800, flexShrink: 0,
                  }}>
                    {fx.result ?? "?"}
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1, minWidth: 0 }}>
                    {fx.opponent.logo && (
                      <img src={fx.opponent.logo} alt="" style={{ width: "14px", height: "14px", objectFit: "contain", flexShrink: 0 }} />
                    )}
                    <span style={{ fontSize: "11px", color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {fx.isHome ? "vs" : "en"} {fx.opponent.name}
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "#111827", flexShrink: 0 }}>{score}</span>
                  <span style={{ fontSize: "10px", color: "#9ca3af", flexShrink: 0, minWidth: "36px", textAlign: "right" }}>
                    {fx.date.slice(5).replace("-", "/")}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Top scorers ── */}
      {topScorers.length > 0 && (
        <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: "10px" }}>
          <p style={{ fontSize: "10px", color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>
            Goleadores · {competition?.confederation ?? "Competición"}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {topScorers.map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: 700, width: "14px", textAlign: "right", flexShrink: 0 }}>
                  {i + 1}.
                </span>
                <span style={{ fontSize: "11px", color: "#111827", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
                <span style={{ fontSize: "10px", color: "#6b7280", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "80px", whiteSpace: "nowrap" }}>
                  {p.team}
                </span>
                <span style={{
                  fontSize: "11px", fontWeight: 800, color: "#d97706",
                  background: "#fef9c3", borderRadius: "6px", padding: "1px 6px", flexShrink: 0,
                }}>
                  {p.goals}⚽
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
