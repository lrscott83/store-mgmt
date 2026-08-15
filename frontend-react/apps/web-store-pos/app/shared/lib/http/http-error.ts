/**
 * True when an HTTP call failed at the network layer (no server response): offline,
 * DNS/connection failure, or the 30s client timeout. Tagged by api-client.ts's response
 * interceptor (`isNetworkError = true`), mirroring Angular's error-interceptor.service.ts
 * :52-59 detection (err.status === 0 || TimeoutError || message includes 'Network').
 */
export function isNetworkError(error: unknown): boolean {
  return (error as { isNetworkError?: boolean } | null | undefined)?.isNetworkError === true;
}

/**
 * Picks the i18n message key for a failed HTTP call in an internet-dependent view:
 * GENERAL.OFFLINE when the failure was a connectivity problem (the network tag above),
 * otherwise the caller's generic fallback key. Use in catch blocks so an offline user
 * sees a connection message ("Sin conexión. Se requiere conexión a internet.") instead of
 * the generic "Ocurrió un error. Intente de nuevo."
 */
export function httpErrorKey(error: unknown, fallbackKey: string): string {
  return isNetworkError(error) ? 'GENERAL.OFFLINE' : fallbackKey;
}
