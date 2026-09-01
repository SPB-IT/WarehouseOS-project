import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchAllSupabaseRows,
  SupabasePaginationError,
} from '../lib/supabasePagination.ts';
import { isSupabasePermissionDenied } from '../lib/supabaseErrors.ts';

test('loads every page instead of stopping at the Supabase 1,000-row limit', async () => {
  const source = Array.from({ length: 1008 }, (_, index) => index + 1);
  const requestedRanges: Array<[number, number]> = [];
  const rows = await fetchAllSupabaseRows<number>(async (from, to) => {
    requestedRanges.push([from, to]);
    return { data: source.slice(from, to + 1), error: null };
  });

  assert.equal(rows.length, 1008);
  assert.deepEqual(requestedRanges, [[0, 999], [1000, 1999]]);
  assert.equal(rows.at(-1), 1008);
});

test('surfaces a Supabase page error', async () => {
  await assert.rejects(
    fetchAllSupabaseRows(async () => ({ data: null, error: { message: 'database unavailable' } })),
    /database unavailable/,
  );
});

test('preserves the Supabase error code and detects permission errors', async () => {
  const error = await fetchAllSupabaseRows(async () => ({
    data: null,
    error: { code: '42501', message: 'permission denied for table deposits' },
  })).then(() => null, (reason: unknown) => reason);

  assert.ok(error instanceof SupabasePaginationError);
  assert.equal(error.code, '42501');
  assert.equal(isSupabasePermissionDenied(error), true);
});
