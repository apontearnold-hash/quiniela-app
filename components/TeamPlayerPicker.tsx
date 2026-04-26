"use client"

import { useState, useEffect, useRef } from "react"
import { useT } from "@/components/LangProvider"

interface PlayerResult {
  id: number
  name: string
  photo: string
  team: string
}

interface Props {
  value: string
  onChange: (name: string, id?: number) => void
  teams: { name: string; flag: string; id?: number }[]
  disabled?: boolean
}

export default function TeamPlayerPicker({ value, onChange, teams, disabled }: Props) {
  const t = useT()
  const [country, setCountry] = useState("")
  const [teamId, setTeamId]   = useState<number | undefined>(undefined)
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<PlayerResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync if parent resets value
  useEffect(() => { setQuery(value) }, [value])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function handleCountryChange(c: string) {
    const team = teams.find(t => t.name === c)
    setCountry(c)
    setTeamId(team?.id)
    setQuery("")
    onChange("", undefined)
    setResults([])
    setOpen(false)
  }

  function handleInput(val: string) {
    setQuery(val)
    if (!val.trim()) { onChange("", undefined); setResults([]); setOpen(false); return }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (val.trim().length < 4) { setResults([]); setOpen(false); return }
      setLoading(true)
      try {
        const params = new URLSearchParams({ q: val.trim() })
        if (country) params.set("country", country)
        if (teamId)  params.set("teamId", String(teamId))
        const res = await fetch(`/api/players/search?${params}`)
        const json = await res.json()
        setResults(json.players ?? [])
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 350)
  }

  function select(player: PlayerResult) {
    setQuery(player.name)
    onChange(player.name, player.id)
    setResults([])
    setOpen(false)
  }

  const selectStyle = { background: "white", border: "1px solid #d1d5db", color: country ? "#111827" : "#9ca3af" }
  const inputStyle  = { background: "white", border: "1px solid #d1d5db", color: "#111827" }

  return (
    <div ref={containerRef} className="flex flex-col gap-2">
      {/* Step 1 — country */}
      <select
        value={country}
        onChange={e => handleCountryChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C518] disabled:opacity-40"
        style={selectStyle}
      >
        <option value="">{t("select_country_label")}</option>
        {teams.map(team => (
          <option key={team.name} value={team.name}>{team.name}</option>
        ))}
      </select>

      {/* Step 2 — player search */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          disabled={disabled || !country}
          placeholder={country ? t("bonus_player_hint") : t("select_team_first")}
          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C518] disabled:opacity-50 disabled:cursor-not-allowed"
          style={inputStyle}
          autoComplete="off"
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#9ca3af" }}>
            {t("player_searching")}
          </span>
        )}

        {open && results.length > 0 && (
          <div
            className="absolute z-50 w-full mt-1 rounded-xl shadow-xl overflow-hidden"
            style={{ background: "white", border: "1px solid #d1d5db", maxHeight: "240px", overflowY: "auto" }}
          >
            {results.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => select(p)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                style={{ borderBottom: "1px solid #f3f4f6" }}
              >
                {p.photo && (
                  <img src={p.photo} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "#111827" }}>{p.name}</p>
                  {p.team && (
                    <p className="text-xs truncate" style={{ color: "#6b7280" }}>{p.team}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {query.trim().length > 0 && query.trim().length < 4 && (
          <div
            className="absolute z-50 w-full mt-1 rounded-xl px-4 py-3"
            style={{ background: "white", border: "1px solid #d1d5db" }}
          >
            <p className="text-xs" style={{ color: "#9ca3af" }}>{t("player_min_chars")}</p>
          </div>
        )}

        {open && !loading && results.length === 0 && query.trim().length >= 4 && (
          <div
            className="absolute z-50 w-full mt-1 rounded-xl px-4 py-3"
            style={{ background: "white", border: "1px solid #d1d5db" }}
          >
            <p className="text-xs" style={{ color: "#9ca3af" }}>
              {country ? t("player_no_results_country") : t("player_no_results")}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
