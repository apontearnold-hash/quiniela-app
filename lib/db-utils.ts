// Supabase (PostgREST) caps SELECT responses at 1000 rows by default.
// Any .select() on a growing table without .range() silently returns at most 1000 rows.
// Use this helper wherever you need all rows from predictions, quinielas, bracket_picks, etc.
export async function fetchAllRows<T>(
  fetcher: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const PAGE = 1000
  const rows: T[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await fetcher(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return rows
}
