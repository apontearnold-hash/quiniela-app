// Helpers compartidos para la integración con API-Football / API-Sports.
// Este módulo es server-side only: la API key NUNCA se expone al navegador.

import { createAdminClient } from "@/lib/supabase-server"

// ── Configuración del Mundial 2026 ────────────────────────────────────────

export const LEAGUE_ID = 1      // FIFA World Cup
export const SEASON    = 2026
const        BASE_URL  = "https://v3.football.api-sports.io"

// ── Tipo de la respuesta de API-Football (campos que usamos) ──────────────
// La API devuelve más campos, pero solo modelamos los que guardamos en Supabase.

export interface FixtureAPIResponse {
  fixture: {
    id:        number
    timezone:  string            // siempre "UTC" en WC
    date:      string            // ISO 8601 string del kickoff
    timestamp: number            // Unix timestamp del kickoff
    status: {
      long:    string            // "Not Started", "Full Time", etc.
      short:   string            // "NS", "FT", "1H", etc.
      elapsed: number | null     // minutos jugados, null si no empezó
    }
  }
  venue: {
    id:   number | null
    name: string | null          // ej. "SoFi Stadium"
    city: string | null          // ej. "Inglewood"
  } | null
  league: {
    id:     number
    season: number
    round:  string               // ej. "Group Stage - 1", "Round of 16"
    group:  string | null        // ej. "Group A", "Group B", null para fases eliminatorias
  }
  teams: {
    home: { id: number; name: string; code?: string; logo?: string }
    away: { id: number; name: string; code?: string; logo?: string }
  }
  goals: { home: number | null; away: number | null }
  score: {
    penalty?: { home: number | null; away: number | null }
  }
}

// ── Helpers de conexión ───────────────────────────────────────────────────

/** Lee la API key de las variables de entorno (acepta ambos nombres posibles). */
export function getApiKey(): string | null {
  return process.env.API_FOOTBALL_KEY || process.env.FOOTBALL_API_KEY || null
}

/**
 * Hace un fetch a API-Sports con los headers de autenticación correctos.
 * Solo debe llamarse desde rutas server-side (app/api/...).
 * Lanza error si falta la API key.
 *
 * @param revalidate  Segundos para cachear la respuesta (Next.js Data Cache).
 *                    Omitir → cache: "no-store" (siempre fresco).
 *                    Útil para datos que cambian poco:
 *                      standings qualifier  → 3600 (1h)
 *                      squads              → 86400 (24h)
 *                      top scorers Mundial → 1800 (30min)
 *                    NO usar para eventos/estadísticas de partidos en vivo.
 */
export async function apiFetch(
  path: string,
  options?: { revalidate?: number },
): Promise<Response> {
  const key = getApiKey()
  if (!key) throw new Error("API_FOOTBALL_KEY no configurada en .env.local")

  if (process.env.NODE_ENV === "development") {
    const cacheLabel = options?.revalidate !== undefined
      ? `cached(${options.revalidate}s)`
      : "no-store"
    console.log(`[api-football] ${cacheLabel} → GET ${path}`)
  }

  const cacheConfig: RequestInit = options?.revalidate !== undefined
    ? ({ next: { revalidate: options.revalidate } } as RequestInit)
    : { cache: "no-store" }

  return fetch(`${BASE_URL}${path}`, {
    headers: { "x-apisports-key": key },
    ...cacheConfig,
  })
}

// ── Mapeo de estado ───────────────────────────────────────────────────────

/**
 * Convierte el código corto de estado de la API al valor interno de Supabase.
 *   NS          → not_started
 *   1H/HT/2H/ET/P → live
 *   FT/AET/PEN  → finished
 *   CANC        → cancelled
 *   PST         → postponed
 */
export function mapStatus(short: string): string {
  const map: Record<string, string> = {
    NS:   "not_started",
    "1H": "live", HT: "live", "2H": "live", ET: "live", P: "live",
    FT:   "finished", AET: "finished", PEN: "finished",
    CANC: "cancelled", PST: "postponed",
  }
  return map[short] ?? "not_started"
}

// ── Log de sincronizaciones ───────────────────────────────────────────────

/**
 * Escribe una entrada en la tabla fixture_sync_log.
 * No-fatal: si la tabla no existe o hay cualquier error, lo ignora silenciosamente
 * para no interrumpir el flujo principal de sync.
 */
export async function writeLog(
  syncType: "fixtures" | "results",
  status:   "success" | "error",
  message:  string,
  rowsAffected: number,
): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from("fixture_sync_log").insert({
      sync_type:     syncType,
      status,
      message,
      rows_affected: rowsAffected,
    })
  } catch {
    // Ignorado: la tabla puede no existir todavía, o el servicio puede fallar.
    // El error no debe bloquear la respuesta principal de sync.
  }
}
