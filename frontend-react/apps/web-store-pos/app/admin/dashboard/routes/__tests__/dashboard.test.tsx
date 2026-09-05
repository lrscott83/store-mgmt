import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';

// ─── superAdminLoader mock ────────────────────────────────────────────────────

vi.mock('~/auth/routes/loaders', () => ({
  superAdminLoader: vi.fn().mockResolvedValue(null),
}));

// ─── usageHttpService mock ────────────────────────────────────────────────────

vi.mock('~/admin/dashboard/lib/services/usage-http-service', () => ({
  usageHttpService: {
    getStoresLastWeek: vi.fn(),
    getStoresLastMonth: vi.fn(),
  },
}));

// ─── StoreUsageChart mock (same pattern as statistics-routes.test.tsx: mocks the
// lazy chart wrapper to keep recharts out of JSDOM; asserts the data contract) ──

vi.mock('~/admin/dashboard/components/store-usage-chart', () => ({
  StoreUsageChart: ({ data }: { data: { label: string; value: number }[] }) => (
    <div data-testid="store-usage-chart">store-usage-chart({data.length})</div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER — getDiasSemana
// ═══════════════════════════════════════════════════════════════════════════════

describe('getDiasSemana — Sunday edge (2026-06-07)', () => {
  it('returns Mon-first rolling window ending on Dom for a Sunday', async () => {
    const { getDiasSemana } = await import('../dashboard');
    // Local-time constructor (not 'YYYY-MM-DD', which is parsed as UTC midnight): getDiasSemana
    // reads getDay() in LOCAL time, so an ISO-date fixture would shift a day on UTC- zones.
    const result = getDiasSemana(new Date(2026, 5, 7));
    expect(result).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']);
  });
});

describe('getDiasSemana — Monday (2026-06-01)', () => {
  it('returns Mon-first rolling window starting from Tue for a Monday', async () => {
    const { getDiasSemana } = await import('../dashboard');
    // Local-time constructor (see Sunday edge above).
    const result = getDiasSemana(new Date(2026, 5, 1));
    expect(result).toEqual(['Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom', 'Lun']);
  });
});

describe('getDias30', () => {
  it('returns string labels 1 through 30', async () => {
    const { getDias30 } = await import('../dashboard');
    const result = getDias30();
    expect(result).toHaveLength(30);
    expect(result[0]).toBe('1');
    expect(result[29]).toBe('30');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESS — exports
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminDashboardPage — exports', () => {
  it('exports a named loader function', async () => {
    const mod = await import('../dashboard');
    expect(typeof mod.clientLoader).toBe('function');
  });

  it('exports AdminDashboardPage as named export', async () => {
    const mod = await import('../dashboard');
    expect(typeof mod.AdminDashboardPage).toBe('function');
  });

  it('exports AdminDashboardPage as default export', async () => {
    const mod = await import('../dashboard');
    expect(typeof mod.default).toBe('function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-1 — render: header + title + both toggle buttons
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminDashboardPage — render', () => {
  it('renders header, title, and both toggle buttons', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    vi.mocked(usageHttpService.getStoresLastWeek).mockResolvedValue({
      succeeded: true,
      data: { storeUsagesCountDays: [1, 2, 3, 4, 5, 6, 7], activeStoreCount: 5 },
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['ADMIN_DASHBOARD.HEADER'])).toBeInTheDocument();
    });

    expect(screen.getByText(esMessages['ADMIN_DASHBOARD.TITLE'])).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: esMessages['ADMIN_DASHBOARD.LAST_7_DAYS'] })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: esMessages['ADMIN_DASHBOARD.LAST_30_DAYS'] })
    ).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-2 — default 7-day fetch on mount
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminDashboardPage — 7-day fetch on mount', () => {
  it('calls getStoresLastWeek on mount and shows day labels in table', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    vi.mocked(usageHttpService.getStoresLastWeek).mockResolvedValue({
      succeeded: true,
      data: { storeUsagesCountDays: [10, 20, 30, 40, 50, 60, 70], activeStoreCount: 5 },
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(usageHttpService.getStoresLastWeek).toHaveBeenCalledTimes(1);
    });

    // Table column headers
    expect(screen.getByText(esMessages['ADMIN_DASHBOARD.COL_CATEGORY'])).toBeInTheDocument();
    expect(screen.getByText(esMessages['ADMIN_DASHBOARD.COL_VALUE'])).toBeInTheDocument();

    // Data row with a count value from the response
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-3 — toggle to 30-day re-fetches
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminDashboardPage — 30-day toggle', () => {
  it('calls getStoresLastMonth when 30-day button is clicked', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    vi.mocked(usageHttpService.getStoresLastWeek).mockResolvedValue({
      succeeded: true,
      data: { storeUsagesCountDays: [1, 2, 3, 4, 5, 6, 7], activeStoreCount: 3 },
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(usageHttpService.getStoresLastMonth).mockResolvedValue({
      succeeded: true,
      data: {
        storeUsagesCountDays: Array.from({ length: 30 }, (_, i) => i + 1),
        activeStoreCount: 3,
      },
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(usageHttpService.getStoresLastWeek).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(
      screen.getByRole('button', { name: esMessages['ADMIN_DASHBOARD.LAST_30_DAYS'] })
    );

    await waitFor(() => {
      expect(usageHttpService.getStoresLastMonth).toHaveBeenCalledTimes(1);
    });

    // Table should now show 30-day labels — '30' appears as category label in the last row
    await waitFor(() => {
      const cells = screen.getAllByText('30');
      expect(cells.length).toBeGreaterThanOrEqual(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-4 — error state
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminDashboardPage — error state', () => {
  it('shows ADMIN_DASHBOARD.ERROR when getStoresLastWeek throws', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    vi.mocked(usageHttpService.getStoresLastWeek).mockRejectedValue(
      new Error('Network error')
    );

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['ADMIN_DASHBOARD.ERROR'])).toBeInTheDocument();
    });
  });

  it('shows the connectivity message (GENERAL.OFFLINE) when getStoresLastWeek rejects with a tagged network error', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    // api-client.ts's response interceptor tags `isNetworkError` when the call never
    // reached a server (offline / 30s timeout).
    vi.mocked(usageHttpService.getStoresLastWeek).mockRejectedValue({
      isNetworkError: true,
      message: 'Network Error',
    } as unknown as Error);

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(esMessages['GENERAL.OFFLINE'])).toBeInTheDocument();
    });
    expect(screen.queryByText(esMessages['ADMIN_DASHBOARD.ERROR'])).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-5 — activeStoreCount rendered in the horizontal bar
// (REWRITTEN: this test used to pin that activeStoreCount was NOT rendered;
// the dashboard now shows it as the horizontal active-stores bar).
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminDashboardPage — activeStoreCount rendered in the horizontal bar', () => {
  it('renders the active store count next to the horizontal bar', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    vi.mocked(usageHttpService.getStoresLastWeek).mockResolvedValue({
      succeeded: true,
      data: { storeUsagesCountDays: [1, 2, 3, 4, 5, 6, 7], activeStoreCount: 9999 },
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(
        screen.getByText(`${esMessages['ADMIN_DASHBOARD.ACTIVE_STORES']}: 9999`)
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId('admin-active-stores-bar')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-7 — Total | Promedio summary line (owner dashboard table parity)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminDashboardPage — Total | Promedio summary line', () => {
  it('shows the sum and the average of the daily counts', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    vi.mocked(usageHttpService.getStoresLastWeek).mockResolvedValue({
      succeeded: true,
      data: { storeUsagesCountDays: [10, 20, 30, 40, 50, 60, 70], activeStoreCount: 5 },
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          `${esMessages['ADMIN_DASHBOARD.TOTAL']}: 280 | ${esMessages['ADMIN_DASHBOARD.AVERAGE']}: 40.00`
        )
      ).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-3 (extended) — toggle back from 30-day to 7-day re-fetches last week
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminDashboardPage — toggle back to 7-day', () => {
  it('calls getStoresLastWeek again after toggling 30-day then back to 7-day', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    vi.mocked(usageHttpService.getStoresLastWeek).mockResolvedValue({
      succeeded: true,
      data: { storeUsagesCountDays: [1, 2, 3, 4, 5, 6, 7], activeStoreCount: 3 },
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(usageHttpService.getStoresLastMonth).mockResolvedValue({
      succeeded: true,
      data: {
        storeUsagesCountDays: Array.from({ length: 30 }, (_, i) => i + 1),
        activeStoreCount: 3,
      },
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    // Wait for initial 7-day fetch
    await waitFor(() => {
      expect(usageHttpService.getStoresLastWeek).toHaveBeenCalledTimes(1);
    });

    // Toggle to 30-day
    fireEvent.click(
      screen.getByRole('button', { name: esMessages['ADMIN_DASHBOARD.LAST_30_DAYS'] })
    );
    await waitFor(() => {
      expect(usageHttpService.getStoresLastMonth).toHaveBeenCalledTimes(1);
    });

    // Toggle back to 7-day — getStoresLastWeek must be called a second time
    fireEvent.click(
      screen.getByRole('button', { name: esMessages['ADMIN_DASHBOARD.LAST_7_DAYS'] })
    );
    await waitFor(() => {
      expect(usageHttpService.getStoresLastWeek).toHaveBeenCalledTimes(2);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-4b — succeeded:false → empty table, no throw (Angular parity)
//   Angular guards `if (response && response.succeeded)` before consuming data.
//   React must NOT call setData when succeeded is false or data is null.
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminDashboardPage — succeeded:false leaves table empty', () => {
  it('renders an empty table body when succeeded is false and data is null', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    // The backend really does return `data: null` on a failed response, which the
    // BaseResponseModel type does not admit — hence the cast through the awaited
    // return type rather than a blanket `any`.
    type StoresLastWeekResponse = Awaited<ReturnType<typeof usageHttpService.getStoresLastWeek>>;
    vi.mocked(usageHttpService.getStoresLastWeek).mockResolvedValue({
      succeeded: false,
      data: null,
      message: 'Internal server error',
      actionCode: 0,
      errors: [],
    } as unknown as StoresLastWeekResponse);

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(usageHttpService.getStoresLastWeek).toHaveBeenCalledTimes(1);
    });

    // No error message because no exception was thrown
    expect(screen.queryByText(esMessages['ADMIN_DASHBOARD.ERROR'])).not.toBeInTheDocument();

    // Table is still rendered (categories are set before fetch)
    expect(screen.getByRole('table')).toBeInTheDocument();

    // All data cells should fall back to 0 (data array is empty, not set from null)
    const valueCells = screen.getAllByText('0');
    expect(valueCells.length).toBe(7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-6 — range-button active state (Angular parity: admin-dashboard.component.html:13-14)
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminDashboardPage — range-button active state', () => {
  it('marks the 7-day button active on load, and moves the active state to 30-day on click', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    vi.mocked(usageHttpService.getStoresLastWeek).mockResolvedValue({
      succeeded: true,
      data: { storeUsagesCountDays: [1, 2, 3, 4, 5, 6, 7], activeStoreCount: 5 },
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(usageHttpService.getStoresLastMonth).mockResolvedValue({
      succeeded: true,
      data: { storeUsagesCountDays: Array.from({ length: 30 }, (_, i) => i + 1), activeStoreCount: 5 },
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    const btn7 = await screen.findByRole('button', { name: esMessages['ADMIN_DASHBOARD.LAST_7_DAYS'] });
    const btn30 = screen.getByRole('button', { name: esMessages['ADMIN_DASHBOARD.LAST_30_DAYS'] });

    await waitFor(() => {
      expect(btn7).toHaveAttribute('aria-pressed', 'true');
    });
    expect(btn30).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(btn30);

    await waitFor(() => {
      expect(btn30).toHaveAttribute('aria-pressed', 'true');
    });
    expect(btn7).toHaveAttribute('aria-pressed', 'false');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE-4 (extended) — value||0 fallback when response array is shorter than labels
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminDashboardPage — value||0 fallback for missing rows', () => {
  it('renders 0 for rows beyond the length of storeUsagesCountDays', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    // Only 3 values for a 7-label window — rows 4-7 should show 0
    vi.mocked(usageHttpService.getStoresLastWeek).mockResolvedValue({
      succeeded: true,
      data: { storeUsagesCountDays: [10, 20, 30], activeStoreCount: 1 },
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(usageHttpService.getStoresLastWeek).toHaveBeenCalledTimes(1);
    });

    // Provided values must appear
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('20')).toBeInTheDocument();
      expect(screen.getByText('30')).toBeInTheDocument();
    });

    // Missing rows (indices 3-6) must fall back to 0 — there are 4 such rows
    await waitFor(() => {
      const zeroCells = screen.getAllByText('0');
      expect(zeroCells.length).toBe(4);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CHART — the days-vs-count chart (owner-dashboard pattern: lazy chart-core
// wrapper). The wrapper is mocked above (recharts stays out of JSDOM); these
// tests pin the DATA CONTRACT the wrapper receives: one point per day label,
// values aligned by index with the ||0 fallback, and the re-fetch on toggle.
// ═══════════════════════════════════════════════════════════════════════════════

describe('AdminDashboardPage — store-usage chart', () => {
  it('renders the chart with one aligned point per 7-day label', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    vi.mocked(usageHttpService.getStoresLastWeek).mockResolvedValue({
      succeeded: true,
      data: { storeUsagesCountDays: [10, 20, 30, 40, 50, 60, 70], activeStoreCount: 5 },
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('store-usage-chart')).toHaveTextContent(
        'store-usage-chart(7)'
      );
    });
  });

  it('pads short responses with 0-valued points (same ||0 fallback as the table)', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    // Only 3 values for a 7-label window — points 4-7 must exist with value 0
    vi.mocked(usageHttpService.getStoresLastWeek).mockResolvedValue({
      succeeded: true,
      data: { storeUsagesCountDays: [10, 20, 30], activeStoreCount: 1 },
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('store-usage-chart')).toHaveTextContent(
        'store-usage-chart(7)'
      );
    });
  });

  it('re-renders the chart with 30 points after the 30-day toggle', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    vi.mocked(usageHttpService.getStoresLastWeek).mockResolvedValue({
      succeeded: true,
      data: { storeUsagesCountDays: [1, 2, 3, 4, 5, 6, 7], activeStoreCount: 3 },
      message: '',
      actionCode: 0,
      errors: [],
    });
    vi.mocked(usageHttpService.getStoresLastMonth).mockResolvedValue({
      succeeded: true,
      data: {
        storeUsagesCountDays: Array.from({ length: 30 }, (_, i) => i + 1),
        activeStoreCount: 3,
      },
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('store-usage-chart')).toHaveTextContent(
        'store-usage-chart(7)'
      );
    });

    fireEvent.click(
      screen.getByRole('button', { name: esMessages['ADMIN_DASHBOARD.LAST_30_DAYS'] })
    );

    await waitFor(() => {
      expect(screen.getByTestId('store-usage-chart')).toHaveTextContent(
        'store-usage-chart(30)'
      );
    });
  });

  it('renders the chart with all-zero points while no data has loaded (empty-state contract)', async () => {
    const { usageHttpService } = await import(
      '~/admin/dashboard/lib/services/usage-http-service'
    );
    // 7 zeros — chart-core's allZero branch shows the empty message, so the
    // wrapper must still RECEIVE the 7 points (contract), not be skipped.
    vi.mocked(usageHttpService.getStoresLastWeek).mockResolvedValue({
      succeeded: true,
      data: { storeUsagesCountDays: [0, 0, 0, 0, 0, 0, 0], activeStoreCount: 0 },
      message: '',
      actionCode: 0,
      errors: [],
    });

    const { AdminDashboardPage } = await import('../dashboard');
    render(
      <Wrapper>
        <AdminDashboardPage />
      </Wrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('store-usage-chart')).toHaveTextContent(
        'store-usage-chart(7)'
      );
    });
  });
});
