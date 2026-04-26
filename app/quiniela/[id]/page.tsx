import { createClient } from "@/lib/supabase-server"
import { redirect, notFound } from "next/navigation"
import Navbar from "@/components/Navbar"
import Link from "next/link"
import PredictionsEditor from "@/components/PredictionsEditor"
import type { Quiniela, Fixture, Prediction, BracketPick, Phase } from "@/lib/types"
import { PHASE_LABELS, PHASE_MULTIPLIER } from "@/lib/types"
import { BRACKET_FIXTURES } from "@/lib/bracket-slots"
import { getServerT } from "@/lib/server-lang"

export const dynamic = "force-dynamic"

const ALL_PHASES: Phase[] = ["groups", "round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"]

export default async function QuinielaViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  const t = await getServerT()

  const { data: quiniela } = await supabase
    .from("quinielas")
    .select("*, profiles(display_name, email)")
    .eq("id", id)
    .single()

  if (!quiniela) notFound()

  const isOwner = quiniela.user_id === user.id

  const { data: predictions } = await supabase
    .from("predictions")
    .select("*, fixtures(*)")
    .eq("quiniela_id", id)
    .order("fixtures(kickoff)", { ascending: true })

  // Group by phase
  const byPhase: Record<string, Prediction[]> = {}
  ALL_PHASES.forEach(p => { byPhase[p] = [] })
  predictions?.forEach(pred => {
    const phase = (pred.fixtures as Fixture)?.phase ?? "groups"
    if (!byPhase[phase]) byPhase[phase] = []
    byPhase[phase].push(pred as Prediction)
  })

  // Group fixtures (real API) — bracket slot fixtures come from static constant
  const { data: groupFixtures } = await supabase
    .from("fixtures")
    .select("*")
    .eq("phase", "groups")
    .order("kickoff", { ascending: true })

  const allFixtures: Fixture[] = [
    ...((groupFixtures ?? []) as Fixture[]),
    ...BRACKET_FIXTURES,
  ]

  const predMap: Record<number, Prediction> = {}
  predictions?.forEach(p => { predMap[p.fixture_id] = p as Prediction })

  // Bracket picks for view
  const { data: bracketPicksRaw } = await supabase
    .from("bracket_picks")
    .select("*")
    .eq("quiniela_id", id)

  const bracketPickMap: Record<string, BracketPick> = {}
  bracketPicksRaw?.forEach(bp => { bracketPickMap[bp.slot_key] = bp as BracketPick })

  const firstGroupKickoff = (allFixtures ?? [])
    .filter(f => f.phase === "groups" && f.kickoff)
    .map(f => f.kickoff as string)
    .sort()[0] ?? null
  const lockDate = firstGroupKickoff
    ? new Date(new Date(firstGroupKickoff).toDateString()).toISOString()
    : null

  // Phase breakdown: pts per phase
  const phaseBreakdown = ALL_PHASES.map(phase => {
    const preds = byPhase[phase] ?? []
    const pts = preds.reduce((sum, p) => sum + (p.points_earned ?? 0), 0)
    const played = preds.filter(p => (p.fixtures as Fixture)?.home_score !== null).length
    const total = preds.length
    return { phase, pts, played, total }
  }).filter(pb => pb.total > 0)

  const q = quiniela as Quiniela
  const quinielaStatus = (q.status ?? "draft") as "draft" | "submitted"

  return (
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <Link href="/dashboard" className="text-sm hover:underline" style={{ color: "#6b7280" }}>← Dashboard</Link>
            <h1 className="text-2xl sm:text-3xl font-black mt-1" style={{ color: "#111827" }}>{q.name}</h1>
            {q.profiles && (
              <p className="text-sm mt-0.5" style={{ color: "#6b7280" }}>
                {t("by_label")} {(q.profiles as { display_name?: string; email?: string }).display_name || (q.profiles as { email?: string }).email}
              </p>
            )}
          </div>
          {isOwner && (
            <Link
              href={`/quiniela/${id}/edit`}
              className="flex items-center gap-2 py-2.5 px-5 rounded-xl font-bold text-black text-sm uppercase tracking-wide flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #F5C518, #FFD700)' }}
            >
              ✏️ {t("edit")}
            </Link>
          )}
        </div>


        {/* Score summary */}
        <div
          className="rounded-2xl p-5 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-4"
          style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
        >
          <ScoreStat icon="⭐" label="Total" value={q.total_points} highlight />
          <ScoreStat icon="🎯" label={t("exact")} value={q.exact_results} />
          <ScoreStat icon="✅" label={t("winners")} value={q.correct_winners} />
          <ScoreStat icon="📊" label={t("predictions")} value={predictions?.length ?? 0} />
        </div>

        {/* Phase breakdown bar */}
        {phaseBreakdown.some(pb => pb.played > 0) && (
          <div
            className="rounded-2xl p-4 mb-5"
            style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
          >
            <p className="text-xs uppercase tracking-widest font-bold mb-3" style={{ color: "#374151" }}>{t("phase_pts")}</p>
            <div className="flex flex-wrap gap-2">
              {phaseBreakdown.map(({ phase, pts, played, total }) => (
                <div key={phase} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: pts > 0 ? "#fffbeb" : "#f9fafb", border: pts > 0 ? "1px solid #fde68a" : "1px solid #e5e7eb" }}>
                  <div>
                    <p className="text-xs leading-none" style={{ color: "#111827" }}>{PHASE_LABELS[phase]}</p>
                    <p className="text-xs leading-none mt-0.5" style={{ color: "#9ca3af" }}>×{PHASE_MULTIPLIER[phase]} · {played}/{total}</p>
                  </div>
                  <span className={`text-lg font-black ml-1 ${pts > 0 ? "text-[#d97706]" : "text-[#9ca3af]"}`}>{pts}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bonus predictions */}
        {(q.top_scorer_pick || q.most_goals_team_pick) && (
          <div
            className="rounded-2xl p-5 mb-5"
            style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
          >
            <h2 className="font-bold text-xs uppercase tracking-widest mb-3" style={{ color: "#d97706" }}>{t("bonus_picks_summary")}</h2>
            <div className="grid grid-cols-2 gap-3">
              {q.top_scorer_pick && (
                <BonusItem icon="⚽" label={t("bonus_top_scorer")} value={q.top_scorer_pick} points={q.top_scorer_points} maxPts={20} />
              )}
              {q.most_goals_team_pick && (
                <BonusItem icon="🎯" label={t("bonus_most_goals")} value={q.most_goals_team_pick} points={q.most_goals_team_points} maxPts={15} />
              )}
            </div>
          </div>
        )}

        {/* Predictions — same layout as edit page, read-only */}
        <PredictionsEditor
          quinielaId={id}
          allFixtures={allFixtures}
          existingPredictions={predMap}
          existingBracketPicks={bracketPickMap}
          quinielaStatus={quinielaStatus}
          lockDate={lockDate}
          readOnly
        />
      </div>
    </div>
  )
}

// ── Stat + Bonus components ───────────────────────────────────────────────
function ScoreStat({ icon, label, value, highlight }: { icon: string; label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xl">{icon}</span>
      <span className={`text-2xl font-black ${highlight ? "text-[#d97706]" : "text-[#111827]"}`}>{value}</span>
      <span className="text-xs" style={{ color: "#6b7280" }}>{label}</span>
    </div>
  )
}

function BonusItem({ icon, label, value, points = 0, maxPts }: { icon: string; label: string; value: string; points?: number; maxPts: number }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#f9fafb", border: "1px solid #e5e7eb" }}>
      <span className="text-xl">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs" style={{ color: "#6b7280" }}>{label}</p>
        <p className="text-sm font-medium truncate" style={{ color: "#111827" }}>{value}</p>
      </div>
      <span className={`text-sm font-bold flex-shrink-0 ${points > 0 ? "text-[#d97706]" : "text-[#9ca3af]"}`}>
        {points > 0 ? `+${points}` : `/${maxPts}`}
      </span>
    </div>
  )
}
