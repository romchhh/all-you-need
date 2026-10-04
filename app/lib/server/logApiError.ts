/**
 * Structured server-side API error logging (Sentry-ready shape).
 */
export function logApiError(
  scope: string,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  console.error(
    JSON.stringify({
      level: 'error',
      scope,
      message,
      stack,
      ts: new Date().toISOString(),
      ...context,
    })
  );
}
