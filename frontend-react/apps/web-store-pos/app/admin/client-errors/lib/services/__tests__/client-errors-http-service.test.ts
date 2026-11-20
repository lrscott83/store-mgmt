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

  it('omits ownerId and storeId when no filter is selected', async () => {
    const { clientErrorsHttpService } = await import('../client-errors-http-service');

    await clientErrorsHttpService.getErrors({
      from: FROM,
      to: TO,
      page: 1,
      pageSize: 50,
    });

    const params = await lastQueryParams();
    // "No owner" is the ABSENCE of the parameter, never `ownerId=`.
    expect(params.has('ownerId')).toBe(false);
    expect(params.has('storeId')).toBe(false);
    expect(params.get('from')).toBe(FROM);
    expect(params.get('to')).toBe(TO);
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

describe('localDateRange normalization', () => {
  /** Local midnight / last millisecond of a local calendar day, computed independently. */
  function localDayBounds(value: string): { from: number; to: number } {
    const [year, month, day] = value.split('-').map(Number);
    return {
      from: new Date(year, month - 1, day, 0, 0, 0, 0).getTime(),
      to: new Date(year, month - 1, day, 23, 59, 59, 999).getTime(),
    };
  }

  function localToday(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  it('swaps an inverted range instead of querying the wrong period', async () => {
    const { localDateRange } = await import('../client-errors-http-service');

    const range = localDateRange('2026-11-20', '2026-11-10');

    const start = localDayBounds('2026-11-10');
    const end = localDayBounds('2026-11-20');
    expect(new Date(range.from).getTime()).toBe(start.from);
    expect(new Date(range.to).getTime()).toBe(end.to);
    expect(new Date(range.from).getTime()).toBeLessThan(new Date(range.to).getTime());
  });

  it('uses the remaining bound for the whole day when one input is cleared', async () => {
    const { localDateRange } = await import('../client-errors-http-service');

    const expected = localDayBounds('2026-11-10');
    for (const range of [
      localDateRange('2026-11-10', ''),
      localDateRange('', '2026-11-10'),
    ]) {
      expect(new Date(range.from).getTime()).toBe(expected.from);
      expect(new Date(range.to).getTime()).toBe(expected.to);
    }
  });

  it("falls back to the SuperAdmin's current local day only when both inputs are empty", async () => {
    const { localDateRange } = await import('../client-errors-http-service');

    const range = localDateRange('', '');

    const expected = localDayBounds(localToday());
    expect(new Date(range.from).getTime()).toBe(expected.from);
    expect(new Date(range.to).getTime()).toBe(expected.to);
    expect(range.from).toMatch(OFFSET_INSTANT);
    expect(range.to).toMatch(OFFSET_INSTANT);
  });
});
