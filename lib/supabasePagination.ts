export interface SupabasePage<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAllSupabaseRows<T>(
  fetchPage: (from: number, to: number) => Promise<SupabasePage<T>>,
  pageSize = 1000,
) {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}
