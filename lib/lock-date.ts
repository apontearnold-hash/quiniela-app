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
  groupFixtures: Array<{ kickoff?: string | null }>,
): Promise<string | null> {
  const { data } = await supabase
    .from("tournament_config")
    .select("lock_date")
    .eq("id", 1)
    .single()

  if (data?.lock_date) return data.lock_date as string

  // Fallback: midnight of the day of the earliest kickoff
  const firstKickoff = groupFixtures
    .filter(f => f.kickoff)
    .map(f => f.kickoff as string)
    .sort()[0] ?? null

  return firstKickoff
    ? new Date(new Date(firstKickoff).toDateString()).toISOString()
    : null
}
