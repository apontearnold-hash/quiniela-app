/**
 * Expected group composition for the 2026 FIFA World Cup.
 * Source: FIFA official draw, December 5, 2024.
 *
 * IMPORTANT: Team names must match exactly what API-Football returns in
 * fixtures.home_team_name / fixtures.away_team_name (comparison is
 * case-insensitive, but verify accents — e.g. "Türkiye" ≠ "Turkey").
 *
 * To look up exact names in your DB for a given group:
 *   SELECT DISTINCT home_team_name FROM fixtures WHERE group_name = 'Grupo X'
 *   UNION
 *   SELECT DISTINCT away_team_name FROM fixtures WHERE group_name = 'Grupo X';
 *
 * Groups with empty arrays are skipped by validateGroups() — add teams
 * only after confirming the exact API team names from the DB.
 */
export const EXPECTED_GROUPS: Readonly<Record<string, readonly string[]>> = {
  "Grupo A": [],
  "Grupo B": [],
  "Grupo C": ["Brazil", "Morocco", "Haiti", "Scotland"],
  "Grupo D": ["USA", "Australia", "Paraguay", "Türkiye"],
  "Grupo E": [],
  "Grupo F": [],
  "Grupo G": [],
  "Grupo H": [],
  "Grupo I": [],
  "Grupo J": [],
  "Grupo K": [],
  "Grupo L": [],
}

export interface GroupValidationWarning {
  group: string
  expected: string[]
  actual: string[]
  missing: string[]     // in expected but not found in actual
  unexpected: string[]  // in actual but not in expected
}

/**
 * Compares actual group composition against EXPECTED_GROUPS.
 * Only validates groups that have at least one expected team defined.
 * Returns one entry per inconsistent group (empty array = all checked groups OK).
 *
 * Does NOT modify any data — purely diagnostic.
 */
export function validateGroups(
  actualGroups: Record<string, string[]>,
): GroupValidationWarning[] {
  const warnings: GroupValidationWarning[] = []

  for (const [group, expectedTeams] of Object.entries(EXPECTED_GROUPS)) {
    if (expectedTeams.length === 0) continue

    const actual = actualGroups[group] ?? []
    if (actual.length === 0) continue  // group has no fixtures yet — skip

    const norm = (s: string) => s.toLowerCase().trim()
    const missing    = expectedTeams.filter(e => !actual.some(a => norm(a) === norm(e)))
    const unexpected = actual.filter(a => !expectedTeams.some(e => norm(e) === norm(a)))

    if (missing.length > 0 || unexpected.length > 0) {
      warnings.push({
        group,
        expected: [...expectedTeams].sort(),
        actual:   [...actual].sort(),
        missing,
        unexpected,
      })
    }
  }

  return warnings
}

/**
 * Formats validation warnings as human-readable strings suitable for
 * server logs and the admin API response.
 */
export function formatGroupWarnings(warnings: GroupValidationWarning[]): string[] {
  return warnings.map(w => {
    const lines = [
      `⚠ ${w.group} inconsistente — Esperado: [${w.expected.join(", ")}] · Actual en DB: [${w.actual.join(", ")}]`,
    ]
    if (w.missing.length > 0)    lines.push(`  Faltantes en DB: ${w.missing.join(", ")}`)
    if (w.unexpected.length > 0) lines.push(`  Inesperados en DB: ${w.unexpected.join(", ")}`)
    return lines.join("\n")
  })
}

/**
 * Builds an actual group → team names map from fixture rows.
 * Deduplicates team names within each group.
 */
export function buildActualGroupMap(
  fixtures: Array<{
    group_name: string | null
    home_team_name: string | null
    away_team_name: string | null
  }>,
): Record<string, string[]> {
  const map: Record<string, Set<string>> = {}

  for (const f of fixtures) {
    if (!f.group_name) continue
    if (!map[f.group_name]) map[f.group_name] = new Set()
    if (f.home_team_name) map[f.group_name].add(f.home_team_name)
    if (f.away_team_name) map[f.group_name].add(f.away_team_name)
  }

  return Object.fromEntries(
    Object.entries(map).map(([g, teams]) => [g, [...teams]])
  )
}
