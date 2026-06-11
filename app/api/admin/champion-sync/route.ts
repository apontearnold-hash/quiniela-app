import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import { fetchAllRows } from "@/lib/db-utils"

async function verifyAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) return null
  return user
}

function deriveChampionFromFin(pick: {
  home_score_pred: number | null
  away_score_pred: number | null
  penalties_winner: string | null
  home_team_name_pred: string | null
  away_team_name_pred: string | null
  home_team_flag_pred: string | null
  away_team_flag_pred: string | null
}): { champion_team_name: string | null; champion_team_flag: string | null } {
  if (pick.home_score_pred == null || pick.away_score_pred == null) {
    return { champion_team_name: null, champion_team_flag: null }
  }
  const h = pick.home_score_pred, a = pick.away_score_pred, pw = pick.penalties_winner
  if (h > a)         return { champion_team_name: pick.home_team_name_pred, champion_team_flag: pick.home_team_flag_pred }
  if (a > h)         return { champion_team_name: pick.away_team_name_pred, champion_team_flag: pick.away_team_flag_pred }
  if (pw === "home") return { champion_team_name: pick.home_team_name_pred, champion_team_flag: pick.home_team_flag_pred }
  if (pw === "away") return { champion_team_name: pick.away_team_name_pred, champion_team_flag: pick.away_team_flag_pred }
  return { champion_team_name: null, champion_team_flag: null }
}

// GET — list all quinielas where stored champion doesn't match the FIN bracket pick
export async function GET() {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()

  const [finPicks, quinielas] = await Promise.all([
    fetchAllRows<{
      quiniela_id: string
      home_score_pred: number | null
      away_score_pred: number | null
      penalties_winner: string | null
      home_team_name_pred: string | null
      away_team_name_pred: string | null
      home_team_flag_pred: string | null
      away_team_flag_pred: string | null
    }>((from, to) =>
      admin.from("bracket_picks")
        .select("quiniela_id, home_score_pred, away_score_pred, penalties_winner, home_team_name_pred, away_team_name_pred, home_team_flag_pred, away_team_flag_pred")
        .eq("slot_key", "FIN")
        .range(from, to)
    ),
    fetchAllRows<{ id: string; name: string; status: string; pool_id: string | null; champion_team_name: string | null }>((from, to) =>
      admin.from("quinielas")
        .select("id, name, status, pool_id, champion_team_name")
        .range(from, to)
    ),
  ])

  const quinielaById = new Map(quinielas.map(q => [q.id, q]))

  const inconsistent = finPicks
    .map(pick => {
      const { champion_team_name: derived } = deriveChampionFromFin(pick)
      if (!derived) return null
      const q = quinielaById.get(pick.quiniela_id)
      if (!q) return null
      if (q.champion_team_name === derived) return null
      return {
        quiniela_id:     q.id,
        name:            q.name,
        status:          q.status,
        pool_id:         q.pool_id,
        stored_champion: q.champion_team_name,
        correct_champion: derived,
      }
    })
    .filter(Boolean)

  return NextResponse.json({
    total: inconsistent.length,
    submitted: inconsistent.filter(r => r!.status === "submitted").length,
    draft:     inconsistent.filter(r => r!.status === "draft").length,
    quinielas: inconsistent,
  })
}

// POST — fix all inconsistencies by syncing champion_team_name from FIN bracket pick
export async function POST() {
  const user = await verifyAdmin()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const admin = createAdminClient()

  const finPicks = await fetchAllRows<{
    quiniela_id: string
    home_score_pred: number | null
    away_score_pred: number | null
    penalties_winner: string | null
    home_team_name_pred: string | null
    away_team_name_pred: string | null
    home_team_flag_pred: string | null
    away_team_flag_pred: string | null
  }>((from, to) =>
    admin.from("bracket_picks")
      .select("quiniela_id, home_score_pred, away_score_pred, penalties_winner, home_team_name_pred, away_team_name_pred, home_team_flag_pred, away_team_flag_pred")
      .eq("slot_key", "FIN")
      .range(from, to)
  )

  const quinielas = await fetchAllRows<{ id: string; champion_team_name: string | null }>((from, to) =>
    admin.from("quinielas").select("id, champion_team_name").range(from, to)
  )
  const quinielaById = new Map(quinielas.map(q => [q.id, q]))

  const toFix = finPicks.map(pick => {
    const derived = deriveChampionFromFin(pick)
    if (!derived.champion_team_name) return null
    const q = quinielaById.get(pick.quiniela_id)
    if (!q || q.champion_team_name === derived.champion_team_name) return null
    return { id: pick.quiniela_id, ...derived }
  }).filter(Boolean) as Array<{ id: string; champion_team_name: string; champion_team_flag: string | null }>

  if (toFix.length === 0) {
    return NextResponse.json({ message: "No hay inconsistencias. Todo OK.", fixed: 0 })
  }

  const results = await Promise.all(
    toFix.map(({ id, champion_team_name, champion_team_flag }) =>
      admin.from("quinielas")
        .update({ champion_team_name, champion_team_flag })
        .eq("id", id)
    )
  )

  const errors = results.filter(r => r.error).map(r => r.error!.message)
  const fixed  = results.filter(r => !r.error).length

  return NextResponse.json({
    message: `Sincronizadas ${fixed} de ${toFix.length} quinielas.`,
    fixed,
    ...(errors.length > 0 && { errors }),
  })
}
