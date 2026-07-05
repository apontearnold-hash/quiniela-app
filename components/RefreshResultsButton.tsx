"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useT } from "@/components/LangProvider"

interface RefreshResponse {
  ok: boolean
  cooldown?: boolean
  maintenance?: boolean
  minutes_ago?: number
  last_sync_at?: string
  fixtures_checked?: number
  fixtures_updated?: number
  group_standings_recalculated?: boolean
  predictions_processed?: number
  quinielas_recalculated?: number
  warnings?: string[]
  errors?: string[]
  error?: string
  timestamp?: string
}

function timeAgoLabel(
  isoStr: string | null,
  tJustNow: string,
  tNMinAgo: string
): string {
  if (!isoStr) return ""
  const diffMs  = Date.now() - new Date(isoStr).getTime()
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 2) return tJustNow
  return tNMinAgo.replace("{n}", String(diffMin))
}

export default function RefreshResultsButton({
  isAdmin,
  initialLastSyncAt,
}: {
  isAdmin: boolean
  initialLastSyncAt: string | null
}) {
  const t      = useT()
  const router = useRouter()

  const [loading,     setLoading]     = useState(false)
  const [response,    setResponse]    = useState<RefreshResponse | null>(null)
  const [lastSyncAt,  setLastSyncAt]  = useState<string | null>(initialLastSyncAt)

  const handleClick = useCallback(async () => {
    if (loading) return
    setLoading(true)
    setResponse(null)

    try {
      const res  = await fetch("/api/sync/request-refresh", { method: "POST" })
      const data: RefreshResponse = await res.json()
      setResponse(data)
      if (data.last_sync_at) setLastSyncAt(data.last_sync_at)
      if (data.ok) router.refresh()
    } catch {
      setResponse({ ok: false, error: "network" })
    } finally {
      setLoading(false)
    }
  }, [loading, router])

  const lastSyncLabel = timeAgoLabel(lastSyncAt, t("refresh_just_now"), t("refresh_n_min_ago"))

  // Determine visual state
  const isCooldown    = response?.cooldown === true
  const isMaintenance = response?.maintenance === true
  const isSuccess      = response?.ok === true
  const isError        = response != null && !response.ok && !response.cooldown && !response.maintenance

  return (
    <div
      className="rounded-xl px-4 py-3 text-sm"
      style={{
        background:   "#f9fafb",
        border:       "1px solid #e5e7eb",
        boxShadow:    "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      {/* Top row: title + last-sync label + button */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Left: title + description */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm leading-snug">
            {t("refresh_results_title")}
          </p>
          <p className="text-gray-500 text-xs mt-0.5 leading-snug">
            {t("refresh_results_desc")}
          </p>
        </div>

        {/* Right: button */}
        <button
          onClick={handleClick}
          disabled={loading}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-opacity disabled:opacity-50"
          style={{ background: "#F5C518", color: "#1a1a00" }}
        >
          {loading ? (
            <>
              <span className="animate-spin inline-block w-3 h-3 border-2 border-[#1a1a00] border-t-transparent rounded-full" />
              {t("refresh_btn_loading")}
            </>
          ) : (
            t("refresh_btn")
          )}
        </button>
      </div>

      {/* Cooldown note + last sync row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2">
        {!isAdmin && <span className="text-gray-400 text-xs">{t("refresh_cooldown_note")}</span>}
        {lastSyncLabel && (
          <span className="text-gray-400 text-xs">
            {t("refresh_last_sync_lbl")} <span className="text-gray-500 font-medium">{lastSyncLabel}</span>
          </span>
        )}
      </div>

      {/* Feedback messages */}
      {isSuccess && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-green-600 font-semibold text-xs">✓ {t("refresh_success_msg")}</span>
          {response.fixtures_updated !== undefined && (
            <span className="text-gray-500 text-xs">
              {response.fixtures_updated} partidos
              {response.predictions_processed !== undefined && ` · ${response.predictions_processed} predicciones`}
              {response.quinielas_recalculated !== undefined && ` · ${response.quinielas_recalculated} quinielas`}
            </span>
          )}
        </div>
      )}

      {isCooldown && response.minutes_ago !== undefined && (
        <div className="mt-2">
          <span className="text-amber-600 text-xs font-medium">
            {t("refresh_cooldown_msg").replace("{n}", String(response.minutes_ago))}
          </span>
        </div>
      )}

      {isMaintenance && (
        <div className="mt-2">
          <span className="text-amber-600 text-xs font-medium">{t("refresh_maintenance_msg")}</span>
        </div>
      )}

      {isError && (
        <div className="mt-2">
          <span className="text-red-500 text-xs">{t("refresh_error_msg")}</span>
        </div>
      )}

      {/* Warnings (non-sensitive only) */}
      {isSuccess && response.warnings && response.warnings.length > 0 && (
        <div className="mt-1.5 text-xs text-amber-600">
          <span className="font-medium">{t("refresh_warnings_lbl")}</span>{" "}
          {response.warnings.join(" · ")}
        </div>
      )}
    </div>
  )
}
