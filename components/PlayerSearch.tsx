"use client"

import { useState, useEffect, useRef } from "react"
import { useT } from "@/components/LangProvider"

interface PlayerResult {
  id: number
  name: string
  photo: string
  team: string
  teamLogo: string
}

interface Props {
  value: string
  onChange: (name: string) => void
  disabled?: boolean
}

export default function PlayerSearch({ value, onChange, disabled }: Props) {
  const t = useT()
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<PlayerResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync external value changes (e.g. reset)
  useEffect(() => { setQuery(value) }, [value])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function handleInput(val: string) {
    setQuery(val)
    // If user clears the field, clear the saved value too
    if (!val.trim()) { onChange(""); setResults([]); setOpen(false); return }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      if (val.trim().length < 2) { setResults([]); setOpen(false); return }
      setLoading(true)
      try {
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(val.trim())}`)
        const json = await res.json()
        setResults(json.players ?? [])
        setOpen(true)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)
  }

  function select(player: PlayerResult) {
    setQuery(player.name)
    onChange(player.name)
    setResults([])
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        disabled={disabled}
        placeholder={t("bonus_player_hint")}
        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C518] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: "white", border: "1px solid #d1d5db", color: "#111827" }}
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
              className="w-full flex items-center gap-3 px-3 py-2 transition-colors text-left hover:bg-gray-50"
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
      {open && !loading && results.length === 0 && query.trim().length >= 2 && (
        <div
          className="absolute z-50 w-full mt-1 rounded-xl px-4 py-3"
          style={{ background: "white", border: "1px solid #d1d5db" }}
        >
          <p className="text-xs" style={{ color: "#9ca3af" }}>{t("player_no_results")}</p>
        </div>
      )}
    </div>
  )
}
