import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase-server"
import {
  EXPECTED_GROUPS,
  validateGroups,
  formatGroupWarnings,
  buildActualGroupMap,
} from "@/lib/group-validation"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data: fixtures, error } = await admin
    .from("fixtures")
    .select("group_name, home_team_name, away_team_name")
    .eq("phase", "groups")
    .not("group_name", "is", null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actualGroupMap = buildActualGroupMap(fixtures ?? [])
  const warnings       = validateGroups(actualGroupMap)
  const formatted      = formatGroupWarnings(warnings)

  const configuredGroups = Object.keys(EXPECTED_GROUPS).filter(
    g => EXPECTED_GROUPS[g].length > 0
  )

  if (formatted.length > 0) {
    for (const w of formatted) console.warn(`[validate-groups] ${w}`)
  }

  return NextResponse.json({
    valid: warnings.length === 0,
    checked: configuredGroups,
    warnings: formatted,
    actualGroupSummary: Object.fromEntries(
      Object.entries(actualGroupMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([g, teams]) => [g, [...teams].sort()])
    ),
  })
}
