import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import {
  recalculateGroupStandings,
  fillGroupAdvancers,
  assignBest3rd,
  advanceKnockout,
} from "@/lib/bracket"
import { recalculateAllPoints } from "@/lib/recalculate"

// ---- Score generators ----

function randGoals(): number {
  const r = Math.random()
  if (r < 0.14) return 0
  if (r < 0.40) return 1
  if (r < 0.67) return 2
  if (r < 0.84) return 3
  if (r < 0.94) return 4
  return 5
}

function simulateGroupGame() {
  return {
    home_score: randGoals(),
    away_score: randGoals(),
    went_to_penalties: false,
    penalties_winner: null as string | null,
    status: "finished",
  }
}

function simulateKnockoutGame() {
  let home = randGoals()
  let away = randGoals()
  let went_to_penalties = false
  let penalties_winner: string | null = null

  if (home === away) {
    const rnd = Math.random()
    if (rnd < 0.35) {
      // Golden goal in ET
      if (Math.random() < 0.5) home++; else away++
    } else if (rnd < 0.65) {
      // ET stays draw → penalties
      went_to_penalties = true
      penalties_winner = Math.random() < 0.5 ? "home" : "away"
    } else {
      // Late goal in regular time
      if (Math.random() < 0.5) home++; else away++
    }
  }

  return {
    home_score: home,
    away_score: away,
    went_to_penalties,
    penalties_winner,
    status: "finished",
  }
}

// ---- Phase constants ----

type Phase = "groups" | "round_of_32" | "round_of_16" | "quarterfinals" | "semifinals" | "final"
const KNOCKOUT_PHASES: Phase[] = ["round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"]
const ALL_PHASES: Phase[] = ["groups", "round_of_32", "round_of_16", "quarterfinals", "semifinals", "final"]

// ---- Simulate one phase ----

async function simulatePhase(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  phase: Phase
): Promise<{ simulated: number; skipped: number }> {
  // "final" also handles Tercer Lugar (3P) which has phase = "semifinals"
  const phaseFilter = phase === "final"
    ? ["final", "semifinals"]
    : [phase]

  const query = admin.from("fixtures").select("*").in("phase", phaseFilter).neq("status", "finished")

  const { data: fixtures, error } = await query
  if (error) throw new Error(`Fetch ${phase} fixtures: ${error.message}`)

  let simulated = 0
  let skipped = 0

  for (const f of fixtures ?? []) {
    // Skip if teams not yet assigned (bracket not filled)
    if (!f.home_team_id || !f.away_team_id) {
      skipped++
      continue
    }

    const result = phase === "groups" ? simulateGroupGame() : simulateKnockoutGame()

    const { error: uErr } = await admin
      .from("fixtures")
      .update({ ...result, updated_at: new Date().toISOString() })
      .eq("id", f.id)

    if (uErr) throw new Error(`Update fixture ${f.id}: ${uErr.message}`)
    simulated++
  }

  return { simulated, skipped }
}

// ---- Route handler ----

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const phase = (body.phase ?? "groups") as Phase | "all"

  if (phase !== "all" && !ALL_PHASES.includes(phase as Phase)) {
    return NextResponse.json({ error: `Fase inválida: ${phase}` }, { status: 400 })
  }

  const admin = await createAdminClient()
  const messages: string[] = []
  let totalSimulated = 0

  try {
    const phases: Phase[] = phase === "all" ? ALL_PHASES : [phase as Phase]

    for (const p of phases) {
      const { simulated, skipped } = await simulatePhase(admin, p)
      totalSimulated += simulated

      if (simulated === 0 && skipped > 0) {
        messages.push(`${p}: ${skipped} partido(s) sin equipos asignados (bracket no listo)`)
        continue
      }
      messages.push(`${p}: ${simulated} partido(s) simulado(s)${skipped > 0 ? `, ${skipped} sin equipo` : ""}`)

      // Advance bracket after each phase
      const standings = await recalculateGroupStandings(admin)
      await fillGroupAdvancers(admin, standings)
      await assignBest3rd(admin, standings)
      await advanceKnockout(admin)
    }

    // Recalculate all quiniela points (use admin client to bypass per-user RLS on update)
    if (totalSimulated > 0) {
      const { predictions, quinielas } = await recalculateAllPoints(admin)
      messages.push(`Puntos recalculados: ${predictions} predicciones en ${quinielas} quinielas`)
    }

    return NextResponse.json({
      message: messages.join(" | "),
      phases: phases,
      total_simulated: totalSimulated,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
