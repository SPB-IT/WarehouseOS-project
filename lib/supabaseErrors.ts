export function isSupabasePermissionDenied(error: unknown) {
  const record = error && typeof error === 'object'
    ? error as { code?: unknown; message?: unknown }
    : null;
  const code = typeof record?.code === 'string' ? record.code : '';
  const message = typeof record?.message === 'string'
    ? record.message
    : error instanceof Error
      ? error.message
      : '';

  return code === '42501' || message.toLowerCase().includes('permission denied');
}
