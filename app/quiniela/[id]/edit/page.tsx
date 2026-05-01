import { createClient } from "@/lib/supabase-server"
import { redirect, notFound } from "next/navigation"
import Navbar from "@/components/Navbar"
import PredictionsEditor from "@/components/PredictionsEditor"
import BonusEditor from "@/components/BonusEditor"
import Link from "next/link"
import type { Fixture, Prediction, BracketPick } from "@/lib/types"
import { BRACKET_FIXTURES } from "@/lib/bracket-slots"
import { getServerT } from "@/lib/server-lang"
import { getLockDate } from "@/lib/lock-date"

export const dynamic = "force-dynamic"

export default async function EditQuinielaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL
  const t = await getServerT()

  const { data: quiniela } = await supabase
    .from("quinielas")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single()

  if (!quiniela) notFound()

  // Pool price + user's already-submitted count in this pool (for confirm dialog)
  const poolId = quiniela.pool_id as string | null
  const [{ data: poolData }, { count: alreadySubmitted }, { data: kfStatuses }] = await Promise.all([
    poolId
      ? supabase.from("pools").select("price_per_quiniela, currency, knockout_editing_open, prize_type, prize_1st, prize_2nd, prize_3rd").eq("id", poolId).single()
      : Promise.resolve({ data: null, error: null }),
    poolId
      ? supabase.from("quinielas").select("id", { count: "exact", head: true })
          .eq("user_id", user.id).eq("pool_id", poolId).eq("status", "submitted")
      : Promise.resolve({ count: 0, error: null }),
    supabase.from("fixtures").select("bracket_position, status").not("bracket_position", "is", null),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const knockoutEditable = (poolData as any)?.knockout_editing_open === true
  const knockoutStatusMap: Record<string, string> = {}
  for (const f of kfStatuses ?? []) {
    if (f.bracket_position) knockoutStatusMap[f.bracket_position] = f.status ?? "not_started"
  }

  // Only real group-stage fixtures from API — knockout slots come from BRACKET_FIXTURES constant
  const { data: groupFixtures } = await supabase
    .from("fixtures")
    .select("*")
    .eq("phase", "groups")
    .order("kickoff", { ascending: true })

  // Merge: real group fixtures + static bracket slot fixtures
  const allFixtures: Fixture[] = [
    ...((groupFixtures ?? []) as Fixture[]),
    ...BRACKET_FIXTURES,
  ]

  // Group stage predictions (keyed by fixture_id)
  const { data: existingPreds } = await supabase
    .from("predictions")
    .select("*")
    .eq("quiniela_id", id)

  const predMap: Record<number, Prediction> = {}
  existingPreds?.forEach(p => { predMap[p.fixture_id] = p as Prediction })

  // Bracket picks (keyed by slot_key)
  const { data: existingBracketPicks } = await supabase
    .from("bracket_picks")
    .select("*")
    .eq("quiniela_id", id)

  const bracketPickMap: Record<string, BracketPick> = {}
  existingBracketPicks?.forEach(bp => { bracketPickMap[bp.slot_key] = bp as BracketPick })

  const lockDate = await getLockDate(supabase, groupFixtures ?? [])

  const isLocked = lockDate ? new Date().getTime() >= new Date(lockDate).getTime() : false
  const quinielaStatus = (quiniela.status ?? "draft") as "draft" | "submitted"

  // Teams for bonus dropdowns — built from group fixtures only
  const teamMap = new Map<string, { flag: string; id: number | null }>()
  ;(groupFixtures ?? []).forEach(f => {
    if (f.home_team_name) teamMap.set(f.home_team_name, { flag: f.home_team_flag ?? "", id: f.home_team_id })
    if (f.away_team_name) teamMap.set(f.away_team_name, { flag: f.away_team_flag ?? "", id: f.away_team_id })
  })
  const teams = Array.from(teamMap.entries())
    .map(([name, { flag, id }]) => ({ name, flag, id: id ?? undefined }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="min-h-screen" style={{ background: "#f0f2f5" }}>
      <Navbar userEmail={user.email} isAdmin={isAdmin} />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <Link href={`/quiniela/${id}`} className="text-sm hover:underline" style={{ color: "#6b7280" }}>← {t("predictions")}</Link>
            <h1 className="text-2xl sm:text-3xl font-black mt-1" style={{ color: "#111827" }}>{quiniela.name}</h1>
            <p className="text-sm mt-1" style={{ color: "#6b7280" }}>
              {isLocked ? `🔒 ${t("bonus_locked")}` : t("bonus_subtitle")}
            </p>
          </div>
          {quinielaStatus === "submitted" ? (
            <span className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide"
              style={{ background: "#dcfce7", color: "#15803d", border: "1px solid #86efac" }}>
              ✅ {t("submitted_label")}
            </span>
          ) : (
            <span className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide"
              style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}>
              {t("draft_label")}
            </span>
          )}
        </div>

        <BonusEditor
          quinielaId={id}
          isLocked={isLocked}
          initial={{
            top_scorer_pick:      quiniela.top_scorer_pick ?? null,
            top_scorer_player_id: quiniela.top_scorer_player_id ?? null,
            most_goals_team_pick: quiniela.most_goals_team_pick ?? null,
            most_goals_team_id:   quiniela.most_goals_team_id ?? null,
          }}
          teams={teams}
        />

        {allFixtures.length === 0 ? (
          <div className="rounded-2xl p-8 text-center" style={{ background: "white", border: "1px solid #d1d5db", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div className="text-5xl mb-4">⏳</div>
            <p className="font-bold mb-2" style={{ color: "#111827" }}>{t("groups_no_data")}</p>
            <p className="text-sm" style={{ color: "#6b7280" }}>{t("groups_no_data_sub")}</p>
          </div>
        ) : (
          <PredictionsEditor
            quinielaId={id}
            allFixtures={allFixtures}
            existingPredictions={predMap}
            existingBracketPicks={bracketPickMap}
            quinielaStatus={quinielaStatus}
            lockDate={lockDate}
            bonusPicks={{
              topScorer:     quiniela.top_scorer_pick ?? null,
              mostGoalsTeam: quiniela.most_goals_team_pick ?? null,
            }}
            poolPrice={poolData?.price_per_quiniela ?? undefined}
            poolCurrency={poolData?.currency ?? undefined}
            poolPrizeType={(poolData as any)?.prize_type === "physical" ? "physical" : "money"}
            poolPrize1st={(poolData as any)?.prize_1st ?? null}
            poolPrize2nd={(poolData as any)?.prize_2nd ?? null}
            poolPrize3rd={(poolData as any)?.prize_3rd ?? null}
            submittedCount={alreadySubmitted ?? 0}
            knockoutEditable={knockoutEditable}
            knockoutStatusMap={knockoutStatusMap}
          />
        )}
      </div>
    </div>
  )
}
