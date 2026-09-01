export interface SupabasePage<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
}

export class SupabasePaginationError extends Error {
  readonly code?: string;

  constructor(error: { message: string; code?: string }) {
    super(error.message);
    this.name = 'SupabasePaginationError';
    this.code = error.code;
  }
}

export async function fetchAllSupabaseRows<T>(
  fetchPage: (from: number, to: number) => Promise<SupabasePage<T>>,
  pageSize = 1000,
) {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new SupabasePaginationError(error);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}
