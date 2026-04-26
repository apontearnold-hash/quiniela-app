"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useT } from "@/components/LangProvider"
import TeamPlayerPicker from "@/components/TeamPlayerPicker"

interface Props {
  quinielaId: string
  isLocked: boolean
  initial: {
    top_scorer_pick: string | null
    top_scorer_player_id: number | null
    most_goals_team_pick: string | null
    most_goals_team_id: number | null
  }
  teams: { name: string; flag: string; id?: number }[]
}

export default function BonusEditor({ quinielaId, isLocked, initial, teams }: Props) {
  const t = useT()
  const supabase = createClient()
  const [topScorer, setTopScorer]           = useState(initial.top_scorer_pick ?? "")
  const [topScorerPlayerId, setTopScorerPlayerId] = useState<number | undefined>(initial.top_scorer_player_id ?? undefined)
  const [mostGoals, setMostGoals]           = useState(initial.most_goals_team_pick ?? "")
  const [mostGoalsTeamId, setMostGoalsTeamId] = useState<number | undefined>(initial.most_goals_team_id ?? undefined)
  const [saving, setSaving]                 = useState(false)
  const [result, setResult]                 = useState<"ok" | "error" | null>(null)
  const [errorMsg, setErrorMsg]             = useState<string | null>(null)
  const [expanded, setExpanded]             = useState(false)

  const hasAnyPick = !!(initial.top_scorer_pick || initial.most_goals_team_pick)

  const handleSave = async () => {
    setSaving(true); setResult(null); setErrorMsg(null)
    const { error } = await supabase
      .from("quinielas")
      .update({
        top_scorer_pick:      topScorer.trim() || null,
        top_scorer_player_id: topScorerPlayerId ?? null,
        most_goals_team_pick: mostGoals || null,
        most_goals_team_id:   mostGoalsTeamId ?? null,
      })
      .eq("id", quinielaId)
    setSaving(false)
    if (error) { setResult("error"); setErrorMsg(error.message) }
    else { setResult("ok"); setExpanded(false); setTimeout(() => setResult(null), 3000) }
  }

  return (
    <div className="rounded-2xl overflow-hidden mb-6" style={{ border: "1px solid #2a5438" }}>
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => !isLocked && setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        style={{ background: "linear-gradient(135deg, #152a1a, #1a3322)" }}
      >
        <div>
          <h2 className="text-[#F5C518] font-bold text-sm uppercase tracking-widest">{t("bonus_title")}</h2>
          <p className="text-[#7ab88a] text-xs mt-0.5">
            {isLocked ? t("bonus_locked") : t("bonus_subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {result === "ok" && <span className="text-green-400 text-xs font-medium">{t("saved")}</span>}
          {!isLocked && (
            <span className="text-[#7ab88a] text-xs font-medium">
              {expanded ? t("bonus_collapse") : t("bonus_edit")}
            </span>
          )}
          {!isLocked && (
            <svg
              width="16" height="16" fill="none" stroke="#7ab88a" strokeWidth="2"
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6l4 4 4-4" />
            </svg>
          )}
        </div>
      </button>

      {/* Summary — collapsed view */}
      {!expanded && hasAnyPick && (
        <div className="px-5 py-3 flex flex-wrap gap-4" style={{ background: "#0a1208" }}>
          {initial.top_scorer_pick && (
            <SummaryPick icon="⚽" value={initial.top_scorer_pick} />
          )}
          {initial.most_goals_team_pick && (
            <SummaryPick icon="🎯" value={initial.most_goals_team_pick} />
          )}
        </div>
      )}

      {/* Expanded edit form */}
      {expanded && !isLocked && (
        <div className="px-5 py-4 flex flex-col gap-4" style={{ background: "#0a1208" }}>
          <BonusField label={t("bonus_top_scorer")} points={20} icon="⚽">
            <TeamPlayerPicker
              value={topScorer}
              onChange={(name, id) => { setTopScorer(name); setTopScorerPlayerId(id) }}
              teams={teams}
            />
          </BonusField>

          <BonusField label={t("bonus_most_goals")} points={15} icon="🎯">
            <TeamSelect
              teams={teams}
              value={mostGoals}
              onChange={(name, id) => { setMostGoals(name); setMostGoalsTeamId(id) }}
              placeholder={t("bonus_team_placeholder")}
            />
          </BonusField>

          <div className="flex items-center gap-3 mt-1">
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 rounded-lg font-bold text-sm transition-all"
              style={{
                background: saving ? "rgba(42,84,56,0.5)" : "linear-gradient(135deg, #2a7a4a, #3a9a5a)",
                color: saving ? "#4a7a5a" : "#fff",
                cursor: saving ? "not-allowed" : "pointer",
              }}>
              {saving ? t("saving") : t("bonus_save")}
            </button>
            <button type="button" onClick={() => setExpanded(false)}
              className="px-4 py-2 rounded-lg text-sm text-[#7ab88a] hover:text-white transition-colors">
              {t("cancel")}
            </button>
            {result === "error" && <span className="text-red-400 text-xs">{errorMsg}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryPick({ icon, value }: { icon: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm">{icon}</span>
      <span className="text-white text-xs font-medium">{value}</span>
    </div>
  )
}

function BonusField({ label, points, icon, children }: {
  label: string; points: number; icon: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(10,18,8,0.8)", border: "1px solid #1a3322" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="text-white text-sm font-medium">{label}</span>
        </div>
        <span className="text-[#F5C518] text-xs font-bold">+{points} pts</span>
      </div>
      {children}
    </div>
  )
}

function TeamSelect({ teams, value, onChange, placeholder, disabled }: {
  teams: { name: string; flag: string; id?: number }[]; value: string
  onChange: (name: string, id?: number) => void; placeholder: string; disabled?: boolean
}) {
  const cls = "w-full px-4 py-2.5 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-[#F5C518] text-sm disabled:opacity-40 disabled:cursor-not-allowed"
  const sty = { background: "#0a1208", border: "1px solid #2a5438" }

  function handleChange(name: string) {
    const team = teams.find(t => t.name === name)
    onChange(name, team?.id)
  }

  if (teams.length === 0) {
    return <input type="text" value={value} onChange={e => handleChange(e.target.value)}
      placeholder={placeholder} disabled={disabled} className={cls} style={sty} />
  }
  return (
    <select value={value} onChange={e => handleChange(e.target.value)} disabled={disabled}
      className={cls} style={{ ...sty, color: value ? "#fff" : "#4a7a5a" }}>
      <option value="">{placeholder}</option>
      {teams.map(team => <option key={team.name} value={team.name}>{team.name}</option>)}
    </select>
  )
}
