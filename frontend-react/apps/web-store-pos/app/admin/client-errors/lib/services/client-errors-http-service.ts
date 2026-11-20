import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

/** Tamaño de página documentado por el backend (`StoreClientErrorsPageSize.Default`). */
export const CLIENT_ERRORS_PAGE_SIZE = 50;

/** Espejo de `StoreClientErrorItemDto`: una fila del panel SuperAdmin. */
export interface StoreClientErrorItem {
  id: string;
  storeId: string | null;
  /** Null cuando el error ocurrió antes de existir una tienda (spec S4). */
  ownerName: string | null;
  storeName: string | null;
  message: string;
  route: string | null;
  location: string | null;
  count: number;
  context: string | null;
  appVersion: string | null;
  device: string | null;
  occurredAt: string;
  receivedAt: string;
}

/** Espejo de `StoreClientErrorsPageDto`: `page`/`pageSize` son los EFECTIVOS del servidor. */
export interface StoreClientErrorsPage {
  totalCount: number;
  page: number;
  pageSize: number;
  items: StoreClientErrorItem[];
}

/** Filtros y paginación de `GET /v1/store-client-errors`. */
export interface ClientErrorsQuery {
  ownerId?: string;
  storeId?: string;
  /** Instante absoluto ISO 8601 (con offset), cota inferior inclusive. */
  from: string;
  /** Instante absoluto ISO 8601 (con offset), cota superior inclusive. */
  to: string;
  page: number;
  pageSize: number;
}

function pad(value: number, size = 2): string {
  return String(value).padStart(size, '0');
}

/**
 * Instant ISO 8601 con el offset LOCAL del navegador. `toISOString()` produciría `Z`, que es
 * absoluto pero borra la zona del SuperAdmin; la fecha desnuda (`2026-11-19`) ni siquiera es un
 * instante. Esto conserva ambas cosas: el día local y el instante absoluto.
 */
export function toOffsetIsoString(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `.${pad(date.getMilliseconds(), 3)}${offset}`
  );
}

/** Valor `YYYY-MM-DD` de un input date para el DÍA LOCAL de `at`. */
export function localDateInputValue(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

interface LocalDateParts {
  year: number;
  month: number;
  day: number;
}

function parseLocalDate(value: string): LocalDateParts | null {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function todayParts(): LocalDateParts {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Orden cronológico de dos fechas locales (el offset no importa: se comparan las partes). */
function compareLocalDates(a: LocalDateParts, b: LocalDateParts): number {
  return a.year * 10_000 + a.month * 100 + a.day - (b.year * 10_000 + b.month * 100 + b.day);
}

/**
 * Normaliza los dos límites del input date antes de convertirlos en instantes absolutos:
 *
 * - Ambos vacíos → el día local ACTUAL del navegador (spec S7).
 * - Un solo límite vacío → ese día completo, el que sí eligió el operador. Devolver "hoy" en el
 *   lado vacío consultaría un período que nadie pidió (y, con un valor viejo, un rango invertido).
 * - Invertidos (`to` < `from`) → se intercambian.
 *
 * Los límites son INCLUSIVOS en el backend, por eso el fin no es la medianoche siguiente.
 */
function normalizeBounds(
  fromParts: LocalDateParts | null,
  toParts: LocalDateParts | null,
): { start: LocalDateParts; end: LocalDateParts } {
  if (fromParts === null && toParts === null) {
    const today = todayParts();
    return { start: today, end: today };
  }
  const start = fromParts ?? (toParts as LocalDateParts);
  const end = toParts ?? (fromParts as LocalDateParts);
  return compareLocalDates(start, end) <= 0 ? { start, end } : { start: end, end: start };
}

/**
 * Convierte dos valores `YYYY-MM-DD` (input date) al rango de instantes absolutos que el backend
 * compara: medianoche local del día inicial y el ÚLTIMO milisegundo local del día final. El rango
 * se normaliza antes (ver `normalizeBounds`) para que un rango invertido o a medio llenar no
 * consulte en silencio un período distinto del que el operador ve.
 */
export function localDateRange(fromValue: string, toValue: string): { from: string; to: string } {
  const { start, end } = normalizeBounds(parseLocalDate(fromValue), parseLocalDate(toValue));
  const from = new Date(start.year, start.month - 1, start.day, 0, 0, 0, 0);
  const to = new Date(end.year, end.month - 1, end.day, 23, 59, 59, 999);
  return { from: toOffsetIsoString(from), to: toOffsetIsoString(to) };
}

export const clientErrorsHttpService = {
  async getErrors(
    query: ClientErrorsQuery,
  ): Promise<BaseResponseModel<StoreClientErrorsPage>> {
    const params = new URLSearchParams();
    // Los filtros vacíos no viajan: "sin owner" es la ausencia del parámetro, nunca `ownerId=`.
    if (query.ownerId) params.set('ownerId', query.ownerId);
    if (query.storeId) params.set('storeId', query.storeId);
    params.set('from', query.from);
    params.set('to', query.to);
    params.set('page', String(query.page));
    params.set('pageSize', String(query.pageSize));

    const response = await apiClient.get<BaseResponseModel<StoreClientErrorsPage>>(
      `/v1/store-client-errors?${params.toString()}`,
    );
    return response.data;
  },
};
