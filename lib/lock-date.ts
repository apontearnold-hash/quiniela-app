import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Returns the quiniela lock date.
 *
 * Priority:
 *   1. tournament_config.lock_date (admin-controlled, stable)
 *   2. Start of day of the earliest group-stage kickoff (dynamic fallback)
 *
 * Pass the already-fetched groupFixtures so this function avoids an extra DB round-trip
 * when the config has no lock_date set.
 */
export async function getLockDate(
  supabase: SupabaseClient,
  _groupFixtures?: Array<{ kickoff?: string | null }>,
): Promise<string | null> {
  const { data } = await supabase
    .from("tournament_config")
    .select("lock_date")
    .eq("id", 1)
    .single()

  // Only lock when explicitly set by admin. null = open.
  return (data?.lock_date as string | null) ?? null
}
