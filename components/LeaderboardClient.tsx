"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useT } from "@/components/LangProvider"
import type { Quiniela } from "@/lib/types"

type LeaderboardRow = Quiniela & {
  profiles: { display_name: string | null; email: string | null } | null
}

interface Props {
  quinielas: LeaderboardRow[]
  myQuinielas: Quiniela[]
  currentUserId: string
  /** team name → flag URL (for most_goals_team_pick flags) */
  teamFlagsRecord: Record<string, string>
}

// # | Jugador/Quiniela | Campeón | Goleador | País goles | Aciertos | Scores | Pts
const COLS = "36px minmax(140px,1fr) 110px 110px 110px 62px 62px 56px"
const MIN_W = "706px"

function Flag({ url, alt }: { url: string | null | undefined; alt: string }) {
  if (!url) return null
  return (
    <img
      src={url}
      alt={alt}
      className="w-5 h-3.5 object-contain rounded-sm flex-shrink-0"
      onError={e => { e.currentTarget.style.display = "none" }}
    />
  )
}

function PickCell({
  name,
  flag,
  empty = "—",
}: {
  name: string | null | undefined
  flag?: string | null
  empty?: string
}) {
  if (!name) {
    return <span className="text-xs" style={{ color: "#d1d5db" }}>{empty}</span>
  }
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Flag url={flag} alt={name} />
      <span className="text-xs truncate" style={{ color: "#374151" }} title={name}>
        {name}
      </span>
    </div>
  )
}

export default function LeaderboardClient({
  quinielas,
  myQuinielas,
  currentUserId,
  teamFlagsRecord,
}: Props) {
  const t = useT()
  const router = useRouter()
  const [filter, setFilter] = useState<"all" | "mine">("all")

  // Draft delete state
  const [deleteTarget, setDeleteTarget] = useState<Quiniela | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/quiniela/${deleteTarget.id}`, { method: "DELETE" })
      const data = await res.json()
      if (!res.ok) { setDeleteError(data.error ?? t("err_delete")); return }
      setDeleteTarget(null)
      router.refresh()
    } finally {
      setDeleting(false)
    }
  }

  const rankMap = new Map(quinielas.map((q, i) => [q.id, i + 1]))
  const drafts  = myQuinielas.filter(q => q.status !== "submitted")
  const rows    = filter === "mine" ? quinielas.filter(q => q.user_id === currentUserId) : quinielas

  const thBase = "px-2.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide whitespace-nowrap select-none"
  const thCtr  = `${thBase} text-center`

  return (
    <div>
      {/* ── Filter toggle ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        {(["all", "mine"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
            style={filter === f
              ? { background: "#111827", color: "#fff" }
              : { background: "#fff", color: "#6b7280", border: "1px solid #d1d5db" }}
          >
            {f === "all" ? t("all_label") : t("my_quinielas")}
          </button>
        ))}
        <span className="text-xs ml-1" style={{ color: "#9ca3af" }}>
          {rows.length} quiniela{rows.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Draft banner (mine view only) ─────────────────────────── */}
      {filter === "mine" && drafts.length > 0 && (
        <div className="mb-3 flex flex-col gap-2">
          {drafts.map(q => (
            <div
              key={q.id}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
              style={{ background: "#fffbeb", border: "1px solid #fde68a" }}
            >
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#92400e" }}>
                  {t("draft_label")}
                </p>
                <p className="text-sm font-semibold truncate" style={{ color: "#111827" }}>{q.name}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => { setDeleteTarget(q); setDeleteError(null) }}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors"
                  style={{ background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" }}
                >
                  {t("delete_btn")}
                </button>
                <Link
                  href={`/quiniela/${q.id}/edit`}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold hover:opacity-90"
                  style={{ background: "#F5C518", color: "#1a1a00" }}
                >
                  {t("complete_preds")}
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Delete confirmation modal ──────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h2 className="font-black text-gray-900 text-base mb-2">{t("delete_draft_title")}</h2>
            <p className="text-sm text-gray-600 mb-1">
              {t("delete_draft_pre")} <strong>&ldquo;{deleteTarget.name}&rdquo;</strong> {t("delete_draft_post")}
            </p>
            {deleteError && (
              <p className="text-xs text-red-600 font-semibold mt-2">{deleteError}</p>
            )}
            <div className="flex gap-3 justify-end mt-5">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {t("cancel")}
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                style={{ background: deleting ? "#ef4444aa" : "#dc2626" }}
              >
                {deleting ? t("deleting_label") : t("delete_confirm_btn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────── */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}
      >
        {/* Horizontal scroll wraps everything; vertical scroll contains header+rows */}
        <div className="overflow-x-auto">
          <div className="overflow-y-auto" style={{ maxHeight: "660px" }}>

            {/* ── Sticky header ──────────────────────────────────── */}
            <div
              className="grid sticky top-0 z-10"
              style={{
                gridTemplateColumns: COLS,
                background: "#f9fafb",
                borderBottom: "2px solid #e5e7eb",
                minWidth: MIN_W,
              }}
            >
              <span className={thCtr} style={{ color: "#9ca3af" }}>#</span>
              <span className={thBase} style={{ color: "#374151" }}>{t("player_col")}</span>
              <span className={thBase} style={{ color: "#7c3aed" }}>🏆 {t("champion_col")}</span>
              <span className={thBase} style={{ color: "#374151" }}>⚽ {t("bonus_scorer_lbl")}</span>
              <span className={thBase} style={{ color: "#374151" }}>🎯 {t("bonus_goals_lbl")}</span>
              <span className={thCtr} style={{ color: "#2563eb" }}>{t("correct_col")}</span>
              <span className={thCtr} style={{ color: "#16a34a" }}>{t("scores_col")}</span>
              <span className={thCtr} style={{ color: "#d97706" }}>{t("pts")}</span>
            </div>

            {/* ── Rows ───────────────────────────────────────────── */}
            {rows.length === 0 ? (
              <div
                className="py-16 flex flex-col items-center gap-3 text-center"
                style={{ minWidth: MIN_W }}
              >
                <span className="text-4xl">🏆</span>
                <p className="font-semibold" style={{ color: "#374151" }}>{t("no_quinielas")}</p>
                <p className="text-sm" style={{ color: "#6b7280" }}>{t("no_quinielas_sub")}</p>
                <Link
                  href="/quiniela/new"
                  className="mt-1 px-5 py-2 rounded-lg font-bold text-sm"
                  style={{ background: "#F5C518", color: "#1a1a00" }}
                >
                  {t("create_quiniela_btn")}
                </Link>
              </div>
            ) : (
              rows.map(q => {
                const rank = rankMap.get(q.id) ?? 0
                const isMine = q.user_id === currentUserId
                const userName = q.profiles?.display_name || q.profiles?.email?.split("@")[0] || "—"
                const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null
                const isTied =
                  (quinielas[rank - 2]?.total_points === q.total_points) ||
                  (quinielas[rank]?.total_points     === q.total_points)
                const accentColor = rank === 1 ? "#F5C518" : rank === 2 ? "#9ca3af" : "#cd7f32"

                const champion   = q.champion_team_name ? { name: q.champion_team_name, flag: q.champion_team_flag ?? null } : null
                const goalsFlag  = q.most_goals_team_pick ? (teamFlagsRecord[q.most_goals_team_pick] ?? null) : null

                return (
                  <div
                    key={q.id}
                    className={`grid items-center cursor-pointer transition-colors ${isMine ? "bg-[#fffbeb] hover:bg-[#fef9e0]" : "bg-white hover:bg-gray-50"}`}
                    style={{
                      gridTemplateColumns: COLS,
                      borderTop: "1px solid #f3f4f6",
                      borderLeft: rank <= 3 ? `3px solid ${accentColor}` : "3px solid transparent",
                      minWidth: MIN_W,
                    }}
                    onClick={() => router.push(`/quiniela/${q.id}`)}
                  >
                    {/* # */}
                    <div className="px-2 py-3 flex items-center justify-center">
                      {medal
                        ? <span className="text-base leading-none">{medal}</span>
                        : <span className="text-xs font-bold" style={{ color: isTied ? "#6b7280" : "#9ca3af" }}>
                            {isTied ? `=${rank}` : rank}
                          </span>
                      }
                    </div>

                    {/* Jugador / Quiniela */}
                    <div className="px-2 py-3 min-w-0">
                      <p className="text-sm font-semibold truncate leading-tight"
                        style={{ color: isMine ? "#92400e" : "#111827" }}>
                        {userName}
                        {isMine && (
                          <span className="text-xs font-normal ml-1" style={{ color: "#9ca3af" }}>
                            {t("you_label")}
                          </span>
                        )}
                      </p>
                      <p className="text-xs truncate leading-tight mt-0.5" style={{ color: "#6b7280" }}>
                        {q.name}
                      </p>
                    </div>

                    {/* Campeón */}
                    <div className="px-2 py-3 min-w-0">
                      <PickCell name={champion?.name} flag={champion?.flag} />
                    </div>

                    {/* Goleador */}
                    <div className="px-2 py-3 min-w-0">
                      <PickCell name={q.top_scorer_pick} />
                    </div>

                    {/* País más goles */}
                    <div className="px-2 py-3 min-w-0">
                      <PickCell name={q.most_goals_team_pick} flag={goalsFlag} />
                    </div>

                    {/* Aciertos (correct winners) */}
                    <div className="px-2 py-3 text-center">
                      <span className="text-sm font-semibold"
                        style={{ color: q.correct_winners > 0 ? "#2563eb" : "#c4c9d4" }}>
                        {q.correct_winners > 0 ? q.correct_winners : "—"}
                      </span>
                    </div>

                    {/* Scores (exact results) */}
                    <div className="px-2 py-3 text-center">
                      <span className="text-sm font-semibold"
                        style={{ color: q.exact_results > 0 ? "#16a34a" : "#c4c9d4" }}>
                        {q.exact_results > 0 ? q.exact_results : "—"}
                      </span>
                    </div>

                    {/* Pts */}
                    <div className="px-2 py-3 text-center">
                      <span className="font-black text-base"
                        style={{ color: rank <= 3 || isMine ? "#d97706" : "#374151" }}>
                        {q.total_points}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Tiebreak footer */}
        <div
          className="px-4 py-2 text-xs"
          style={{ borderTop: "1px solid #f3f4f6", color: "#9ca3af" }}
        >
          {t("tiebreak_note")}
        </div>
      </div>
    </div>
  )
}
