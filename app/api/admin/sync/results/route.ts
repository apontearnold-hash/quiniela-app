import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import { syncResultsFromApiFootball } from "@/lib/fixtures-sync"

// ── POST: actualiza scores y status de partidos ya importados ─────────────
//
// Qué hace: llama al pipeline central (lib/fixtures-sync.ts) — mismo código
// que usan el cron y el botón "Actualizar resultados" del dashboard. Esta
// ruta solo valida que sea el admin y da formato en español a la respuesta.
//
// Cuándo usar: durante el torneo, para ver scores actualizados.

export async function POST() {
  // Verificar que es el admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Validar API key antes de intentar la llamada
  const apiKey = process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta API_FOOTBALL_KEY en .env.local — agrega la variable y reinicia el servidor" },
      { status: 500 }
    )
  }

  const admin = createAdminClient()
  const r = await syncResultsFromApiFootball(admin, "")

  if (r.noMatchesYet) {
    return NextResponse.json({ message: "Sin partidos en curso o terminados aún", count: 0 })
  }

  if (!r.ok && r.fixturesUpdated === 0 && r.groupsUpdated === 0 && r.knockoutUpdated === 0) {
    // Fatal failure before any write (API fetch error, upsert error, or maintenance mode)
    const msg = r.maintenanceMode
      ? "Sync temporalmente desactivado por mantenimiento (DISABLE_FIXTURES_SYNC)"
      : r.errors.join("; ") || "Error desconocido al sincronizar"
    return NextResponse.json({ error: msg, maintenance: r.maintenanceMode }, { status: r.maintenanceMode ? 503 : 502 })
  }

  const msg = [
    `✅ ${r.fixturesUpdated} resultados actualizados`,
    "standings actualizados",
    `bracket: ${r.bracketAdvanced} avances`,
    `${r.predictionsProcessed} predicciones y ${r.quinielasRecalculated} quinielas recalculadas`,
    ...(r.ghostRowsDeleted > 0 ? [`${r.ghostRowsDeleted} filas fantasma limpiadas`] : []),
    ...(r.ghostRowsRemaining > 0 ? [`⚠ ${r.ghostRowsRemaining} filas fantasma detectadas sin limpiar`] : []),
    ...(r.orphanKnockoutRows > 0 ? [`⚠ ${r.orphanKnockoutRows} filas huérfanas de eliminatoria`] : []),
    ...(!r.bracketPicksUntouched ? ["⚠ el conteo de bracket_picks cambió — revisar"] : []),
    ...(r.errors.length ? [`errores: ${r.errors.join("; ")}`] : []),
  ].join(" · ")

  return NextResponse.json({
    message: msg,
    count: r.fixturesUpdated,
    bracketAdvanced: r.bracketAdvanced,
    scored: { predictions: r.predictionsProcessed, quinielas: r.quinielasRecalculated },
    ghostRowsDeleted: r.ghostRowsDeleted,
    ghostRowsRemaining: r.ghostRowsRemaining,
    orphanKnockoutRows: r.orphanKnockoutRows,
    bracketPicksUntouched: r.bracketPicksUntouched,
    ...(r.errors.length && { errors: r.errors }),
    ...(r.warnings.length && { warnings: r.warnings }),
    timestamp: new Date().toISOString(),
  })
}
