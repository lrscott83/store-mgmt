import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { AdminClientErrorsPage } from '../client-errors';

const serviceMock = vi.hoisted(() => ({
  getErrors: vi.fn(),
}));

vi.mock('../../lib/services/client-errors-http-service', async () => {
  const actual = await vi.importActual<typeof import('../../lib/services/client-errors-http-service')>(
    '../../lib/services/client-errors-http-service',
  );
  return { ...actual, clientErrorsHttpService: serviceMock };
});

const ownerServiceMock = vi.hoisted(() => ({
  listOwners: vi.fn(),
}));

vi.mock('~/admin/owners/lib/services/owner-http-service', () => ({
  ownerHttpService: ownerServiceMock,
}));

const OWNER_ONE = {
  id: 'owner-1',
  fullName: 'Ana Pérez',
  storeModules: [
    { storeId: 'store-1', storeName: 'Tienda Uno' },
    { storeId: 'store-2', storeName: 'Tienda Dos' },
  ],
};

const OWNER_TWO = {
  id: 'owner-2',
  fullName: 'Beto Ruiz',
  storeModules: [{ storeId: 'store-9', storeName: 'Tienda Nueve' }],
};

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row-1',
    storeId: 'store-1',
    ownerName: 'Ana Pérez',
    storeName: 'Tienda Uno',
    message: 'TypeError: boom',
    route: '/sales/new',
    location: 'SaleForm',
    count: 3,
    context: null,
    appVersion: '1.0.0',
    device: 'android',
    occurredAt: '2026-11-19T15:04:05.000Z',
    receivedAt: '2026-11-19T15:04:06.000Z',
    ...overrides,
  };
}

function ok(items: ReturnType<typeof item>[], totalCount = items.length) {
  return {
    succeeded: true,
    data: {
      totalCount,
      page: 1,
      pageSize: 50,
      items,
    },
    message: '',
    actionCode: 200,
    errors: [],
  };
}

/**
 * The local calendar day of `at`, computed independently of the page's own helper:
 * the browser's local midnight and the last millisecond of that same local day.
 */
function localDayBounds(at: Date) {
  return {
    from: new Date(at.getFullYear(), at.getMonth(), at.getDate(), 0, 0, 0, 0).getTime(),
    to: new Date(at.getFullYear(), at.getMonth(), at.getDate(), 23, 59, 59, 999).getTime(),
  };
}

/**
 * An instant whose LOCAL calendar day differs from its UTC calendar day, found for whatever
 * zone this machine runs in - without one, a local-day assertion cannot tell a local
 * implementation from a UTC one.
 */
function instantWhereLocalAndUtcDaysDiffer(): Date {
  const localDay = (at: Date) =>
    `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
  const utcDay = (at: Date) =>
    `${at.getUTCFullYear()}-${at.getUTCMonth()}-${at.getUTCDate()}`;
  for (let hour = 0; hour < 24; hour += 1) {
    const candidate = new Date(Date.UTC(2026, 10, 19, hour, 30, 0));
    if (localDay(candidate) !== utcDay(candidate)) return candidate;
  }
  throw new Error('no instant separates the local day from the UTC day in this zone');
}

describe('AdminClientErrorsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock.getErrors.mockResolvedValue(ok([item()]));
    ownerServiceMock.listOwners.mockResolvedValue({
      succeeded: true,
      data: [OWNER_ONE, OWNER_TWO],
      message: '',
      actionCode: 200,
      errors: [],
    });
  });

  function renderPage() {
    return render(
      <IntlProvider locale="es" messages={esMessages}>
        <AdminClientErrorsPage />
      </IntlProvider>,
    );
  }

  it('pide por defecto el día local del navegador del SuperAdmin', async () => {
    const instant = instantWhereLocalAndUtcDaysDiffer();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(instant);

      renderPage();

      await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(1));

      const query = serviceMock.getErrors.mock.calls[0][0];
      const expected = localDayBounds(new Date());
      expect(new Date(query.from).getTime()).toBe(expected.from);
      expect(new Date(query.to).getTime()).toBe(expected.to);
      expect(query.page).toBe(1);
      expect(query.pageSize).toBe(50);
      // Absolute instants with an offset - never a bare date, never an assumed UTC day.
      expect(query.from).toMatch(/[+-]\d{2}:\d{2}$/);
      expect(query.to).toMatch(/[+-]\d{2}:\d{2}$/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('vuelve a consultar con el propietario y la tienda elegidos', async () => {
    renderPage();
    await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByTestId('client-errors-owner'), {
      target: { value: 'owner-1' },
    });

    await waitFor(() =>
      expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
        expect.objectContaining({ ownerId: 'owner-1' }),
      ),
    );
    expect(screen.getByRole('option', { name: 'Tienda Uno' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tienda Dos' })).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('client-errors-store'), {
      target: { value: 'store-2' },
    });

    await waitFor(() =>
      expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
        expect.objectContaining({ ownerId: 'owner-1', storeId: 'store-2' }),
      ),
    );
  });

  it('pinta un guion cuando el error no tiene propietario ni tienda', async () => {
    serviceMock.getErrors.mockResolvedValue(
      ok([item({ ownerName: null, storeName: null, storeId: null })]),
    );

    renderPage();

    const ownerCell = await screen.findByTestId('client-errors-row-owner');
    expect(ownerCell).toHaveTextContent('—');
    expect(screen.getByTestId('client-errors-row-store')).toHaveTextContent('—');
  });
});
