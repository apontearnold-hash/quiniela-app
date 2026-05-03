import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { apiFetch, getApiKey } from "@/lib/api-football"

// ── Normalization ──────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// Common name variants that API-Football uses for nationality vs what our DB has
const COUNTRY_ALIASES: Record<string, string[]> = {
  "united states":  ["usa", "us", "united states of america"],
  "usa":            ["united states", "us"],
  "korea republic": ["south korea", "korea"],
  "south korea":    ["korea republic", "korea"],
  "ivory coast":    ["cote d'ivoire", "côte d'ivoire"],
  "cote d'ivoire":  ["ivory coast"],
  "netherlands":    ["holland"],
  "czech republic": ["czechia"],
  "czechia":        ["czech republic"],
  "republic of ireland": ["ireland"],
  "ireland":        ["republic of ireland"],
}

function countryMatches(nationality: string, selected: string): boolean {
  const n = normalize(nationality)
  const s = normalize(selected)
  if (n === s) return true
  const aliases = COUNTRY_ALIASES[s] ?? []
  return aliases.includes(n)
}

// ── Score a player name against the query tokens ───────────────────────────

function nameScore(playerName: string, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const name = normalize(playerName)
  const allMatch  = tokens.every(t => name.includes(t))
  const lastMatch = name.includes(tokens[tokens.length - 1])
  const firstMatch = name.includes(tokens[0])
  if (!allMatch && !lastMatch && !firstMatch) return -1
  if (allMatch) return tokens.length > 1 ? 4 : 4
  if (lastMatch) return 2
  if (firstMatch) return 1
  return 0
}

// ── API response types ─────────────────────────────────────────────────────

type ProfileEntry = {
  player: {
    id: number
    name: string
    photo: string
    nationality: string | null
  }
}

type SquadPlayer = {
  id: number
  name: string
  photo: string
  position: string
}

type SquadEntry = {
  team: { id: number; name: string }
  players: SquadPlayer[]
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const q       = req.nextUrl.searchParams.get("q")?.trim() ?? ""
  const country = req.nextUrl.searchParams.get("country")?.trim() ?? ""
  const teamIdRaw = req.nextUrl.searchParams.get("teamId")?.trim() ?? ""
  const teamId  = teamIdRaw ? parseInt(teamIdRaw, 10) : null

  if (q.length < 2) return NextResponse.json({ players: [] })

  if (!getApiKey()) {
    return NextResponse.json({ players: [], debug: "API key not configured" })
  }

  const tokens = normalize(q).split(/\s+/).filter(w => w.length > 1)

  console.log("[player-search] query:", q, "| country:", country || "(none)", "| teamId:", teamId ?? "(none)")

  // ── Track A: squad-based search (most reliable when teamId is available) ──
  // Fetches the exact national team roster (~26 players) and filters by name.
  // No nationality mismatch possible since all squad members belong to that team.
  if (teamId) {
    try {
      const res = await apiFetch(`/players/squads?team=${teamId}`, { revalidate: 86400 })
      if (res.ok) {
        const json = await res.json()
        const entries: SquadEntry[] = json.response ?? []
        const squad: SquadPlayer[] = entries.flatMap(e => e.players ?? [])

        console.log("[player-search] squad size:", squad.length, "for teamId", teamId)

        const scored = squad
          .map(p => ({ p, s: nameScore(p.name, tokens) }))
          .filter(({ s }) => s >= 0)
          .sort((a, b) => {
            // Sort: all-token match first, then starts-with, then contains
            if (b.s !== a.s) return b.s - a.s
            const na = normalize(a.p.name), nb = normalize(b.p.name)
            const qt = tokens[tokens.length - 1]
            const aStarts = na.startsWith(qt) ? 1 : 0
            const bStarts = nb.startsWith(qt) ? 1 : 0
            return bStarts - aStarts || na.localeCompare(nb)
          })
          .slice(0, 10)

        console.log("[player-search] squad matches:", scored.length,
          "| top:", scored.slice(0, 3).map(x => x.p.name).join(", "))

        const players = scored.map(({ p }) => ({
          id:    p.id,
          name:  p.name,
          photo: p.photo,
          team:  country,
        }))

        return NextResponse.json({ players })
      }
    } catch (err) {
      console.error("[player-search] squad fetch failed:", err)
      // Fall through to Track B
    }
  }

  // ── Track B: profiles search + hard country filter ─────────────────────
  // Used when no teamId, or when squad fetch fails.
  try {
    const res = await apiFetch(`/players/profiles?search=${encodeURIComponent(q)}`)
    if (!res.ok) {
      return NextResponse.json({ players: [], debug: `API ${res.status}` })
    }

    const json = await res.json()
    if (json.errors && Object.keys(json.errors).length > 0) {
      return NextResponse.json({ players: [], debug: JSON.stringify(json.errors) })
    }

    const entries: ProfileEntry[] = json.response ?? []
    console.log("[player-search] profiles raw count:", entries.length)

    // Hard filter by country when selected — no soft boost, strict match only
    const filtered = country
      ? entries.filter(e => e.player.nationality && countryMatches(e.player.nationality, country))
      : entries

    console.log("[player-search] after country filter:", filtered.length,
      "| sample nationalities:", entries.slice(0, 5).map(e => e.player.nationality).join(", "))

    const scored = filtered
      .map(e => ({ e, s: nameScore(e.player.name, tokens) }))
      .filter(({ s }) => s >= 0)
      .sort((a, b) => {
        if (b.s !== a.s) return b.s - a.s
        const na = normalize(a.e.player.name), nb = normalize(b.e.player.name)
        const qt = tokens[tokens.length - 1]
        return (nb.startsWith(qt) ? 1 : 0) - (na.startsWith(qt) ? 1 : 0) || na.localeCompare(nb)
      })
      .slice(0, 10)

    console.log("[player-search] final results:", scored.length,
      "\n", scored.map(x =>
        `  ${x.e.player.name} (id:${x.e.player.id}) nat:${x.e.player.nationality ?? "null"} score:${x.s}`
      ).join("\n"))

    const players = scored.map(({ e }) => ({
      id:    e.player.id,
      name:  e.player.name,
      photo: e.player.photo,
      team:  e.player.nationality ?? "",
    }))

    return NextResponse.json({ players })
  } catch (err) {
    return NextResponse.json({
      players: [],
      debug: err instanceof Error ? err.message : String(err),
    })
  }
}
