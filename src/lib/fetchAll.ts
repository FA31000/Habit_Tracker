// Supabase returns at most 1000 rows per request (the project's max-rows
// setting), silently dropping the rest. fetchAll asks for one page at a time
// until a short page comes back, so callers get every row.
//
// `page(from, to)` must build the query with a stable, unique ordering
// (e.g. .order('date').order('habit_id')) and end with .range(from, to),
// otherwise rows can be skipped or repeated between pages.
const PAGE_SIZE = 1000

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) return { data: rows, error }
    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return { data: rows, error: null }
  }
}
