"use client"

import { useEffect, useState } from "react"

interface Player {
  id:       number
  name:     string
  age:      number | null
  number:   number | null
  position: string
  photo:    string | null
}

const POSITION_ORDER = ["Goalkeeper", "Defender", "Midfielder", "Attacker"]

const POSITION_LABELS: Record<string, string> = {
  Goalkeeper: "Porteros",
  Defender:   "Defensas",
  Midfielder: "Mediocampistas",
  Attacker:   "Delanteros",
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 border-b border-[#f9fafb]">
      <div className="w-6 h-6 rounded-md flex-shrink-0" style={{ background: "#f3f4f6" }} />
      <div className="w-7 h-7 rounded-full flex-shrink-0" style={{ background: "#f3f4f6" }} />
      <div className="h-3 rounded flex-1" style={{ background: "#f3f4f6" }} />
    </div>
  )
}

interface Props {
  teamId: number
}

export default function TeamSquad({ teamId }: Props) {
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/teams/${teamId}/squad`)
      .then(r => r.ok ? r.json() : { players: [] })
      .then(d => { if (!cancelled) setPlayers(d.players ?? []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [teamId])

  if (loading) {
    return (
      <div className="rounded-xl overflow-hidden mt-3" style={{ background: "white", border: "1px solid #e5e7eb" }}>
        <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #f3f4f6" }}>
          <div className="h-2.5 rounded w-24" style={{ background: "#f3f4f6" }} />
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>
        <div style={{ animation: "pulse 1.5s infinite" }}>
          {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
        </div>
      </div>
    )
  }

  if (players.length === 0) {
    return (
      <div
        className="rounded-xl px-4 py-5 mt-3 text-center"
        style={{ background: "white", border: "1px solid #e5e7eb" }}
      >
        <p className="text-sm" style={{ color: "#6b7280" }}>
          La lista de jugadores aparecerá cuando esté disponible.
        </p>
      </div>
    )
  }

  // Group by position, preserve API order within each group
  const grouped = new Map<string, Player[]>(POSITION_ORDER.map(p => [p, []]))
  players.forEach(p => {
    const key = grouped.has(p.position) ? p.position : "Attacker"
    grouped.get(key)!.push(p)
  })

  return (
    <div className="rounded-xl overflow-hidden mt-3" style={{ background: "white", border: "1px solid #e5e7eb" }}>
      {/* Header */}
      <div className="px-4 py-2.5" style={{ borderBottom: "1px solid #f3f4f6" }}>
        <p className="text-xs font-black uppercase tracking-wider" style={{ color: "#6b7280" }}>
          Jugadores · {players.length}
        </p>
      </div>

      {POSITION_ORDER.map(pos => {
        const group = grouped.get(pos) ?? []
        if (group.length === 0) return null

        return (
          <div key={pos}>
            {/* Position label */}
            <div
              className="px-4 py-1.5"
              style={{ background: "#f9fafb", borderBottom: "1px solid #f3f4f6", borderTop: "1px solid #f3f4f6" }}
            >
              <span className="text-xs font-bold" style={{ color: "#374151" }}>
                {POSITION_LABELS[pos] ?? pos}
              </span>
            </div>

            {/* Player rows */}
            {group.map(player => (
              <div
                key={player.id}
                className="flex items-center gap-2.5 px-3 py-2 border-b border-[#f9fafb]"
              >
                {/* Shirt number */}
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 text-[10px] font-black"
                  style={{ background: "#f3f4f6", color: "#6b7280" }}
                >
                  {player.number ?? "–"}
                </div>

                {/* Photo */}
                {player.photo ? (
                  <img
                    src={player.photo}
                    alt={player.name}
                    className="w-7 h-7 rounded-full object-cover flex-shrink-0"
                    style={{ border: "1.5px solid #f3f4f6" }}
                  />
                ) : (
                  <div
                    className="w-7 h-7 rounded-full flex-shrink-0"
                    style={{ background: "#f3f4f6" }}
                  />
                )}

                {/* Name */}
                <span className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: "#111827" }}>
                  {player.name}
                </span>

                {/* Age */}
                {player.age != null && (
                  <span className="text-xs flex-shrink-0" style={{ color: "#9ca3af" }}>
                    {player.age} a
                  </span>
                )}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
