import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

/** Query params of the most recent apiClient.get call. */
async function lastQueryParams(): Promise<URLSearchParams> {
  const { apiClient } = await import('~/shared/lib/http/api-client');
  // `vi.mock` swaps the module at runtime, but the real `apiClient.get` type is the
  // generic Axios signature, which has no `.mock` - the cast is required to typecheck.
  const url = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as string;
  return new URL(url, 'http://localhost').searchParams;
}

/** An ISO 8601 instant that carries its own UTC offset instead of a bare date. */
const OFFSET_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?[+-]\d{2}:\d{2}$/;

const FROM = '2026-11-19T00:00:00.000-05:00';
const TO = '2026-11-19T23:59:59.999-05:00';

describe('clientErrorsHttpService.getErrors', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { apiClient } = await import('~/shared/lib/http/api-client');
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        succeeded: true,
        data: { totalCount: 0, page: 1, pageSize: 50, items: [] },
        message: '',
        actionCode: 0,
        errors: [],
      },
    });
  });

  it('sends every filter and the pagination in the query string', async () => {
    const { clientErrorsHttpService } = await import('../client-errors-http-service');

    await clientErrorsHttpService.getErrors({
      ownerId: 'owner-1',
      storeId: 'store-1',
      from: FROM,
      to: TO,
      page: 2,
      pageSize: 50,
    });

    const params = await lastQueryParams();
    expect(params.get('ownerId')).toBe('owner-1');
    expect(params.get('storeId')).toBe('store-1');
    expect(params.get('from')).toBe(FROM);
    expect(params.get('to')).toBe(TO);
    expect(params.get('page')).toBe('2');
    expect(params.get('pageSize')).toBe('50');
  });

  it('sends an absolute instant with an offset for both range bounds', async () => {
    const { clientErrorsHttpService, localDateRange } = await import(
      '../client-errors-http-service'
    );

    // The bounds the page actually sends: built from local date parts, never a bare date.
    const range = localDateRange('2026-11-19', '2026-11-19');

    await clientErrorsHttpService.getErrors({
      from: range.from,
      to: range.to,
      page: 1,
      pageSize: 50,
    });

    const params = await lastQueryParams();
    // A bare date ("2026-11-19") is NOT an instant: the backend compares against a UTC
    // column and would have to guess a zone. The offset is what makes it absolute.
    expect(params.get('from')).toMatch(OFFSET_INSTANT);
    expect(params.get('to')).toMatch(OFFSET_INSTANT);
  });

  it('returns response.data as the paged result', async () => {
    const { clientErrorsHttpService } = await import('../client-errors-http-service');

    const result = await clientErrorsHttpService.getErrors({
      from: FROM,
      to: TO,
      page: 1,
      pageSize: 50,
    });

    expect(result.succeeded).toBe(true);
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data.totalCount).toBe(0);
    expect(result.data.items).toEqual([]);
  });
});
