"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase-browser"
import { useRouter } from "next/navigation"
import { useT } from "@/components/LangProvider"
import TeamPlayerPicker from "@/components/TeamPlayerPicker"

interface Team { name: string; flag: string; id?: number }
interface UserPool { id: string; name: string }

export default function CreateQuinielaForm({
  teams,
  userId,
  defaultPoolId,
  userPools,
}: {
  teams: Team[]
  userId: string
  defaultPoolId: string
  userPools: UserPool[]
}) {
  const t = useT()
  const router = useRouter()
  const supabase = createClient()
  const [name, setName] = useState("")
  const [topScorer, setTopScorer] = useState("")
  const [topScorerPlayerId, setTopScorerPlayerId] = useState<number | undefined>(undefined)
  const [mostGoalsTeam, setMostGoalsTeam] = useState("")
  const [mostGoalsTeamId, setMostGoalsTeamId] = useState<number | undefined>(undefined)
  const [poolId, setPoolId] = useState(defaultPoolId)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError(t("quiniela_name_required")); return }
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase.from("quinielas").insert({
      user_id: userId,
      pool_id: poolId,
      name: name.trim(),
      top_scorer_pick:      topScorer.trim() || null,
      top_scorer_player_id: topScorerPlayerId ?? null,
      most_goals_team_pick: mostGoalsTeam || null,
      most_goals_team_id:   mostGoalsTeamId ?? null,
    }).select().single()

    if (err) { setError(err.message); setLoading(false); return }
    router.push(`/quiniela/${data.id}/edit`)
  }

  const cardSty = { background: "linear-gradient(135deg, #152a1a, #1a3322)", border: "1px solid #2a5438" }
  const inputSty = { background: "#0a1208", border: "1px solid #2a5438" }
  const inputCls = "w-full px-4 py-3 rounded-xl text-white placeholder-[#4a7a5a] focus:outline-none focus:ring-2 focus:ring-[#F5C518]"

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Pool selector */}
      {userPools.length > 1 && (
        <div className="rounded-2xl p-6" style={cardSty}>
          <h2 className="text-[#F5C518] font-bold text-sm uppercase tracking-widest mb-3">{t("pool_label")}</h2>
          <select value={poolId} onChange={e => setPoolId(e.target.value)}
            className={inputCls} style={inputSty}>
            {userPools.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Name */}
      <div className="rounded-2xl p-6" style={cardSty}>
        <h2 className="text-[#F5C518] font-bold text-sm uppercase tracking-widest mb-4">{t("quiniela_name_label")}</h2>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder={t("quiniela_name_placeholder")} maxLength={50} required
          className={inputCls} style={inputSty} />
      </div>

      {/* Bonus questions */}
      <div className="rounded-2xl p-6" style={cardSty}>
        <h2 className="text-[#F5C518] font-bold text-sm uppercase tracking-widest mb-1">{t("bonus_title")}</h2>
        <p className="text-[#7ab88a] text-xs mb-5">{t("bonus_subtitle")}</p>

        <div className="flex flex-col gap-4">
          <BonusField label={t("bonus_top_scorer")} points={20} icon="⚽">
            <TeamPlayerPicker
              value={topScorer}
              onChange={(name, id) => { setTopScorer(name); setTopScorerPlayerId(id) }}
              teams={teams}
            />
          </BonusField>

          <BonusField label={t("bonus_most_goals")} points={15} icon="🎯">
            <TeamSelect teams={teams} value={mostGoalsTeam}
              onChange={(name, id) => { setMostGoalsTeam(name); setMostGoalsTeamId(id) }}
              placeholder={t("bonus_team_placeholder")} />
          </BonusField>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => router.back()}
          className="flex-1 py-3 px-6 rounded-xl font-bold text-[#7ab88a] border border-[#2a5438] hover:border-[#7ab88a] transition-colors">
          {t("cancel")}
        </button>
        <button type="submit" disabled={loading}
          className="flex-1 py-3 px-6 rounded-xl font-bold text-black uppercase tracking-wide transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #F5C518, #FFD700)" }}>
          {loading ? t("quiniela_creating") : t("quiniela_create_btn")}
        </button>
      </div>
    </form>
  )
}

function BonusField({ label, points, icon, children }: {
  label: string; points: number; icon: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(10,18,8,0.5)" }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-white text-sm font-medium">{label}</span>
        </div>
        <span className="text-[#F5C518] text-xs font-bold">+{points} pts</span>
      </div>
      {children}
    </div>
  )
}

function TeamSelect({ teams, value, onChange, placeholder }: {
  teams: { name: string; flag: string; id?: number }[]; value: string
  onChange: (name: string, id?: number) => void; placeholder: string
}) {
  const cls = "w-full px-4 py-2.5 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-[#F5C518] text-sm"
  const sty = { background: "#0a1208", border: "1px solid #2a5438" }

  function handleChange(name: string) {
    const team = teams.find(t => t.name === name)
    onChange(name, team?.id)
  }

  if (teams.length === 0) {
    return <input type="text" value={value} onChange={e => handleChange(e.target.value)}
      placeholder={placeholder} className={cls} style={sty} />
  }
  return (
    <select value={value} onChange={e => handleChange(e.target.value)}
      className={cls} style={{ ...sty, color: value ? "#fff" : "#4a7a5a" }}>
      <option value="">{placeholder}</option>
      {teams.map(team => <option key={team.name} value={team.name}>{team.name}</option>)}
    </select>
  )
}
