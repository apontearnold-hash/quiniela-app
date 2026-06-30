"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useLanguage } from "@/components/LangProvider"

export interface RecentFixtureItem {
  id: string
  home_team_name: string | null
  away_team_name: string | null
  home_team_flag: string | null
  away_team_flag: string | null
  home_score: number | null
  away_score: number | null
  went_to_penalties: boolean | null
  penalties_winner: string | null
  penalty_home: number | null
  penalty_away: number | null
  status?: string | null
  elapsed?: number | null
  kickoff?: string | null
}

export interface UpcomingFixtureItem {
  id: string
  home_team_name: string | null
  away_team_name: string | null
  home_team_flag: string | null
  away_team_flag: string | null
  kickoff: string | null
  home_placeholder: string | null
  away_placeholder: string | null
}

function Flag({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return null
  return <img src={src} alt={alt} className="w-5 h-3.5 object-contain flex-shrink-0 rounded-sm" />
}

function ResultCard({ f }: { f: RecentFixtureItem }) {
  const { lang } = useLanguage()
  const isLive = f.status === "live"

  return (
    <Link href={`/fixtures/${f.id}`}>
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors"
        style={{
          background: "white",
          border: isLive ? "1px solid #fca5a5" : "1px solid #d1d5db",
          boxShadow: isLive ? "0 1px 4px rgba(239,68,68,0.15)" : "0 1px 3px rgba(0,0,0,0.06)",
          minWidth: "260px",
        }}
      >
        <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
          <Flag src={f.home_team_flag} alt={f.home_team_name ?? ""} />
          <span className="text-xs font-semibold truncate" style={{ color: "#1f2937" }}>
            {f.home_team_name}
          </span>
        </div>
        <div
          className="flex-shrink-0 flex flex-col items-center px-2 py-0.5 rounded-lg font-black text-sm text-center"
          style={{
            background: isLive ? "#fee2e2" : "#fef3c7",
            color:      isLive ? "#dc2626" : "#92400e",
            minWidth: "44px",
          }}
        >
          {isLive && (
            <span className="text-[8px] font-bold uppercase leading-tight" style={{ color: "#dc2626" }}>
              {f.elapsed ? `${f.elapsed}'` : (lang === "es" ? "En vivo" : "Live")}
            </span>
          )}
          <span>{f.home_score ?? "–"}–{f.away_score ?? "–"}</span>
          {f.went_to_penalties && f.penalties_winner && (
            <span className="text-[8px] font-bold leading-tight" style={{ color: "#92400e" }}>
              {f.penalties_winner === "home" ? f.home_team_name : f.away_team_name}
              {f.penalty_home != null ? ` ${f.penalty_home}–${f.penalty_away}` : ""} pens
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-xs font-semibold truncate" style={{ color: "#1f2937" }}>
            {f.away_team_name}
          </span>
          <Flag src={f.away_team_flag} alt={f.away_team_name ?? ""} />
        </div>
      </div>
    </Link>
  )
}

const TICKER_TZ = "America/Chicago"
const TICKER_TZ_LABEL = "CT"

function UpcomingCard({ f }: { f: UpcomingFixtureItem }) {
  const { lang } = useLanguage()
  const locale = lang === "en" ? "en-US" : "es-MX"

  const date = f.kickoff
    ? new Date(f.kickoff).toLocaleDateString(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: TICKER_TZ,
      })
    : null

  const time = f.kickoff
    ? new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: TICKER_TZ,
      }).format(new Date(f.kickoff)) + " " + TICKER_TZ_LABEL
    : null

  return (
    <Link href={`/fixtures/${f.id}`}>
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer hover:border-[#d97706] transition-colors"
        style={{
          background: "white",
          border: "1px solid #d1d5db",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
          minWidth: "280px",
        }}
      >
        <div className="flex items-center gap-1.5 flex-1 justify-end min-w-0">
          <Flag src={f.home_team_flag} alt={f.home_team_name ?? ""} />
          <span className="text-xs font-semibold truncate" style={{ color: "#1f2937" }}>
            {f.home_team_name || f.home_placeholder || "TBD"}
          </span>
        </div>
        <div
          className="flex-shrink-0 flex flex-col items-center gap-0 px-2 py-1 rounded-lg text-center"
          style={{ background: "#f3f4f6", minWidth: "80px" }}
        >
          {date && (
            <span className="text-[10px] font-bold capitalize leading-tight" style={{ color: "#6b7280" }}>
              {date}
            </span>
          )}
          {time && (
            <span className="text-[10px] font-medium leading-tight" style={{ color: "#9ca3af" }}>
              {time}
            </span>
          )}
          {!date && <span className="text-[10px] font-bold" style={{ color: "#6b7280" }}>—</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-xs font-semibold truncate" style={{ color: "#1f2937" }}>
            {f.away_team_name || f.away_placeholder || "TBD"}
          </span>
          <Flag src={f.away_team_flag} alt={f.away_team_name ?? ""} />
        </div>
      </div>
    </Link>
  )
}

// ── Generic ticker ────────────────────────────────────────────────────────

const MIN_TO_ANIMATE = 3
const SECS_PER_ITEM  = 5

function Ticker<T extends { id: string }>({
  items,
  renderCard,
}: {
  items: T[]
  renderCard: (item: T) => React.ReactNode
}) {
  const [paused,       setPaused]       = useState(false)
  const [animated,     setAnimated]     = useState(false)

  useEffect(() => {
    const noMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const isMobile = window.matchMedia("(max-width: 767px)").matches
    const enoughItems = items.length >= MIN_TO_ANIMATE
    const should = enoughItems && !noMotion && !isMobile

    setAnimated(should)
  }, [items.length])

  const duration   = `${items.length * SECS_PER_ITEM}s`
  const trackItems = animated ? [...items, ...items] : items

  if (!animated) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "thin" }}>
        {items.map((item, i) => (
          <div key={`${item.id}-${i}`} className="flex-shrink-0">
            {renderCard(item)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className="overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="flex gap-2 pb-1"
        style={{
          width: "max-content",
          animation: `ticker-roll ${duration} linear infinite`,
          animationPlayState: paused ? "paused" : "running",
        }}
      >
        {trackItems.map((item, i) => (
          <div key={`${item.id}-${i}`} className="flex-shrink-0">
            {renderCard(item)}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Public exports ────────────────────────────────────────────────────────

export function RecentFixtureTicker({ items }: { items: RecentFixtureItem[] }) {
  return <Ticker items={items} renderCard={f => <ResultCard f={f} />} />
}

export function UpcomingFixtureTicker({ items }: { items: UpcomingFixtureItem[] }) {
  return <Ticker items={items} renderCard={f => <UpcomingCard f={f} />} />
}
