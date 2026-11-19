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

function parseLocalDate(value: string): { year: number; month: number; day: number } | null {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

/**
 * Convierte dos valores `YYYY-MM-DD` (input date) al rango de instantes absolutos que el backend
 * compara: medianoche local del día inicial y el ÚLTIMO milisegundo local del día final. Ambos
 * límites son INCLUSIVOS en el backend, así que el fin del día no puede ser la medianoche
 * siguiente.
 */
export function localDateRange(fromValue: string, toValue: string): { from: string; to: string } {
  const now = new Date();
  const today = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  const fromParts = parseLocalDate(fromValue) ?? today;
  const toParts = parseLocalDate(toValue) ?? today;
  const from = new Date(fromParts.year, fromParts.month - 1, fromParts.day, 0, 0, 0, 0);
  const to = new Date(toParts.year, toParts.month - 1, toParts.day, 23, 59, 59, 999);
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
