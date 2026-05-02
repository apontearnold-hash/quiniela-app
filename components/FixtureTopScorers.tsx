"use client"

import { useEffect, useState } from "react"

interface TopScorer {
  id:    number
  name:  string
  photo: string
  team:  string
  goals: number
}

interface CtxData {
  found:       boolean
  competition: { leagueId: number; name: string; confederation: string } | null
  topScorers:  TopScorer[]
}

interface Section {
  label:   string
  scorers: TopScorer[]
}

export default function FixtureTopScorers({
  homeTeamId,
  awayTeamId,
}: {
  homeTeamId: number
  awayTeamId: number
}) {
  const [sections, setSections] = useState<Section[]>([])

  useEffect(() => {
    Promise.all([
      fetch(`/api/teams/${homeTeamId}/context`)
        .then(r => r.ok ? (r.json() as Promise<CtxData>) : null)
        .catch(() => null),
      fetch(`/api/teams/${awayTeamId}/context`)
        .then(r => r.ok ? (r.json() as Promise<CtxData>) : null)
        .catch(() => null),
    ]).then(([hd, ad]) => {
      const result: Section[] = []

      if (hd?.found && hd.topScorers?.length > 0) {
        result.push({
          label:   `Top Goleadores · ${hd.competition?.name ?? hd.competition?.confederation ?? "Eliminatoria"}`,
          scorers: hd.topScorers,
        })
      }

      // Only add away confederation if it's a different league
      if (ad?.found && ad.topScorers?.length > 0) {
        const sameLeague = hd?.competition?.leagueId === ad.competition?.leagueId
        if (!sameLeague) {
          result.push({
            label:   `Top Goleadores · ${ad.competition?.name ?? ad.competition?.confederation ?? "Eliminatoria"}`,
            scorers: ad.topScorers,
          })
        }
      }

      setSections(result)
    })
  }, [homeTeamId, awayTeamId])

  if (sections.length === 0) return null

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
      {sections.map((sec) => (
        <div
          key={sec.label}
          style={{
            background: "white",
            border: "1px solid #d1d5db",
            borderRadius: "16px",
            padding: "16px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <p style={{
            fontSize: "10px", color: "#6b7280", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px",
          }}>
            {sec.label}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {sec.scorers.map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "10px", color: "#9ca3af", fontWeight: 700, width: "14px", textAlign: "right", flexShrink: 0 }}>
                  {i + 1}.
                </span>
                <span style={{ fontSize: "12px", color: "#111827", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
                <span style={{ fontSize: "11px", color: "#6b7280", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", maxWidth: "90px", whiteSpace: "nowrap" }}>
                  {p.team}
                </span>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#d97706", background: "#fef9c3", borderRadius: "6px", padding: "1px 6px", flexShrink: 0 }}>
                  {p.goals}⚽
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
