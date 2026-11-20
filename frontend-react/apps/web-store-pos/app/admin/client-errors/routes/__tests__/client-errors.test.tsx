import { describe, expect, it, vi, beforeEach, afterAll } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';
import { superAdminLoader } from '~/auth/routes/loaders';
import routeConfig from '~/routes';
import { Sidebar } from '~/shared/components/sidebar';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { AdminClientErrorsPage, clientLoader } from '../client-errors';

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

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

/**
 * The page's contract is "the SuperAdmin's OWN local day". Pinning the process time zone makes
 * the expectation independent of where the runner lives: in UTC the local day and the UTC day are
 * the same, so a local-day bug would be invisible. Asia/Tokyo is UTC+9 all year (no DST), so the
 * expected instants are exact and stable.
 */
const ORIGINAL_TZ = process.env.TZ;
process.env.TZ = 'Asia/Tokyo';

afterAll(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

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

function dateInput(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
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
    // 2026-11-19T20:30Z is 2026-11-20 05:30 in Asia/Tokyo: local day ≠ UTC day on purpose.
    const instant = new Date(Date.UTC(2026, 10, 19, 20, 30, 0));
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(instant);

      renderPage();

      await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(1));

      const query = serviceMock.getErrors.mock.calls[0][0];
      // Local day boundaries of 2026-11-20 in UTC+09:00, expressed as absolute instants.
      expect(query.from).toBe('2026-11-20T00:00:00.000+09:00');
      expect(query.to).toBe('2026-11-20T23:59:59.999+09:00');
      expect(new Date(query.from).toISOString()).toBe('2026-11-19T15:00:00.000Z');
      expect(new Date(query.to).toISOString()).toBe('2026-11-20T14:59:59.999Z');
      // The date inputs show the SuperAdmin's local day, not the UTC one.
      expect(dateInput('Desde').value).toBe('2026-11-20');
      expect(dateInput('Hasta').value).toBe('2026-11-20');
      expect(query.page).toBe(1);
      expect(query.pageSize).toBe(50);
    } finally {
      vi.useRealTimers();
    }
  });

  it('vuelve a consultar con el propietario y la tienda elegidos', async () => {
    renderPage();
    await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Propietario'), {
      target: { value: 'owner-1' },
    });

    await waitFor(() =>
      expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
        expect.objectContaining({ ownerId: 'owner-1' }),
      ),
    );
    expect(screen.getByRole('option', { name: 'Tienda Uno' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Tienda Dos' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tienda'), {
      target: { value: 'store-2' },
    });

    await waitFor(() =>
      expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
        expect.objectContaining({ ownerId: 'owner-1', storeId: 'store-2' }),
      ),
    );
  });

  it('no envía los filtros vacíos como parámetros', async () => {
    renderPage();
    await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(1));

    const query = serviceMock.getErrors.mock.calls[0][0];
    expect(query.ownerId).toBeUndefined();
    expect(query.storeId).toBeUndefined();
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

  it('repite la página que devolvió el servidor en la paginación', async () => {
    serviceMock.getErrors.mockResolvedValue({
      ...ok([item()], 120),
      data: { totalCount: 120, page: 2, pageSize: 50, items: [item()] },
    });

    renderPage();

    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument();
  });

  describe('fallos de la consulta', () => {
    it('vacía la tabla y muestra el error cuando la respuesta no fue exitosa', async () => {
      serviceMock.getErrors.mockResolvedValue({
        succeeded: false,
        data: null,
        message: 'boom',
        actionCode: 500,
        errors: [],
      });

      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudieron cargar los errores.',
      );
      expect(screen.queryByTestId('client-errors-row-message')).not.toBeInTheDocument();
      expect(screen.queryByTestId('client-errors-total')).not.toBeInTheDocument();
    });

    it('traduce un rechazo de red al mensaje de sin conexión', async () => {
      serviceMock.getErrors.mockRejectedValue(
        Object.assign(new Error('offline'), { isNetworkError: true }),
      );

      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Sin conexión. Se requiere conexión a internet.',
      );
      expect(screen.queryByTestId('client-errors-row-message')).not.toBeInTheDocument();
    });

    it('traduce un rechazo no relacionado con la red al error genérico', async () => {
      serviceMock.getErrors.mockRejectedValue(new Error('unexpected'));

      renderPage();

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'No se pudieron cargar los errores.',
      );
    });
  });

  describe('reinicio de página y tienda al cambiar filtros', () => {
    beforeEach(() => {
      serviceMock.getErrors.mockResolvedValue(ok([item()], 120));
    });

    async function goToSecondPage() {
      renderPage();
      await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

      await waitFor(() =>
        expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
          expect.objectContaining({ page: 2 }),
        ),
      );
    }

    it('cambiar el propietario vuelve a la página 1 y limpia la tienda elegida', async () => {
      renderPage();
      await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(1));

      fireEvent.change(screen.getByLabelText('Propietario'), { target: { value: 'owner-1' } });
      await waitFor(() =>
        expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
          expect.objectContaining({ ownerId: 'owner-1' }),
        ),
      );

      fireEvent.change(screen.getByLabelText('Tienda'), { target: { value: 'store-2' } });
      await waitFor(() =>
        expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
          expect.objectContaining({ ownerId: 'owner-1', storeId: 'store-2' }),
        ),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
      await waitFor(() =>
        expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
          expect.objectContaining({ page: 2 }),
        ),
      );

      fireEvent.change(screen.getByLabelText('Propietario'), { target: { value: 'owner-2' } });

      await waitFor(() =>
        expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
          expect.objectContaining({ ownerId: 'owner-2', page: 1 }),
        ),
      );
      // The previously selected store belonged to the old owner.
      expect(serviceMock.getErrors.mock.calls.at(-1)?.[0].storeId).toBeUndefined();
    });

    it('cambiar la tienda vuelve a la página 1', async () => {
      await goToSecondPage();

      fireEvent.change(screen.getByLabelText('Propietario'), { target: { value: 'owner-1' } });
      await waitFor(() =>
        expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
          expect.objectContaining({ ownerId: 'owner-1', page: 1 }),
        ),
      );

      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
      await waitFor(() =>
        expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
          expect.objectContaining({ page: 2 }),
        ),
      );

      fireEvent.change(screen.getByLabelText('Tienda'), { target: { value: 'store-1' } });

      await waitFor(() =>
        expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
          expect.objectContaining({ storeId: 'store-1', page: 1 }),
        ),
      );
    });

    it('cambiar la fecha inicial vuelve a la página 1', async () => {
      await goToSecondPage();

      fireEvent.change(dateInput('Desde'), { target: { value: '2026-11-10' } });

      await waitFor(() =>
        expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
          expect.objectContaining({ page: 1 }),
        ),
      );
      expect(serviceMock.getErrors.mock.calls.at(-1)?.[0].from).toContain('2026-11-10T00:00:00');
    });

    it('cambiar la fecha final vuelve a la página 1', async () => {
      await goToSecondPage();

      fireEvent.change(dateInput('Hasta'), { target: { value: '2026-11-10' } });

      await waitFor(() =>
        expect(serviceMock.getErrors).toHaveBeenLastCalledWith(
          expect.objectContaining({ page: 1 }),
        ),
      );
      // Hasta = 2026-11-10 with the default Desde later than it: the range is normalized.
      expect(serviceMock.getErrors.mock.calls.at(-1)?.[0].from).toContain('2026-11-10T00:00:00');
    });
  });

  describe('rango de fechas normalizado', () => {
    async function lastQuery() {
      await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalled());
      return serviceMock.getErrors.mock.calls.at(-1)?.[0];
    }

    it('intercambia un rango invertido en vez de consultar el período equivocado', async () => {
      renderPage();
      await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(1));

      fireEvent.change(dateInput('Desde'), { target: { value: '2026-11-20' } });
      await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(2));

      fireEvent.change(dateInput('Hasta'), { target: { value: '2026-11-10' } });

      const query = await lastQuery();
      expect(query.from).toBe('2026-11-10T00:00:00.000+09:00');
      expect(query.to).toBe('2026-11-20T23:59:59.999+09:00');
      expect(new Date(query.from).getTime()).toBeLessThan(new Date(query.to).getTime());
    });

    it('usa el otro extremo cuando un límite se queda vacío', async () => {
      renderPage();
      await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(1));

      fireEvent.change(dateInput('Desde'), { target: { value: '2026-11-10' } });
      await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(2));

      fireEvent.change(dateInput('Hasta'), { target: { value: '2026-11-15' } });
      await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(3));

      // Clearing the end keeps the day that is still selected, not "today".
      fireEvent.change(dateInput('Hasta'), { target: { value: '' } });

      const query = await lastQuery();
      expect(query.from).toBe('2026-11-10T00:00:00.000+09:00');
      expect(query.to).toBe('2026-11-10T23:59:59.999+09:00');
    });

    it('cae al día local actual solo cuando ambos límites están vacíos', async () => {
      const instant = new Date(Date.UTC(2026, 10, 19, 20, 30, 0));
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(instant);
        renderPage();
        await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(1));

        fireEvent.change(dateInput('Desde'), { target: { value: '' } });
        await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(2));

        fireEvent.change(dateInput('Hasta'), { target: { value: '' } });
        await waitFor(() => expect(serviceMock.getErrors).toHaveBeenCalledTimes(3));

        const query = serviceMock.getErrors.mock.calls.at(-1)?.[0];
        expect(query.from).toBe('2026-11-20T00:00:00.000+09:00');
        expect(query.to).toBe('2026-11-20T23:59:59.999+09:00');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe('client errors route and menu authorization', () => {
  const superAdmin = (): UserModel => ({
    id: 'u1',
    login: 'admin@test.com',
    fullName: 'Super Admin',
    cellPhone: '+1',
    email: 'admin@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1_000_000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: true,
    isOwnerAdmin: false,
    isReSeller: false,
    selectedStoreId: '',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
  });

  const ownerAdmin = (): UserModel => ({
    ...superAdmin(),
    login: 'owner@test.com',
    fullName: 'Owner Admin',
    isSuperAdmin: false,
    isOwnerAdmin: true,
  });

  function renderSidebar(user: UserModel) {
    vi.mocked(useAuthStore).mockReturnValue({ user } as ReturnType<typeof useAuthStore>);
    return render(
      <IntlProvider locale="es" messages={esMessages}>
        <MemoryRouter>
          <Sidebar isOpen onClose={() => {}} />
        </MemoryRouter>
      </IntlProvider>,
    );
  }

  it('expone clientLoader === superAdminLoader en el módulo de ruta', () => {
    expect(clientLoader).toBe(superAdminLoader);
  });

  it('registra la ruta admin/client-errors', () => {
    interface RouteEntry {
      path?: string;
      file?: string;
      children?: RouteEntry[];
    }
    const flatten = (entries: RouteEntry[]): RouteEntry[] =>
      entries.flatMap((entry) => [entry, ...flatten(entry.children ?? [])]);

    const entry = flatten(routeConfig as unknown as RouteEntry[]).find(
      (candidate) => candidate.path === 'admin/client-errors',
    );

    expect(entry).toBeDefined();
    expect(entry?.file).toBe('admin/client-errors/routes/client-errors.tsx');
  });

  it('oculta la entrada del menú a un usuario que no es SuperAdmin', () => {
    renderSidebar(ownerAdmin());

    const links = screen.getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(links).not.toContain('/admin/client-errors');
    expect(screen.queryByText('Errores del cliente')).not.toBeInTheDocument();
  });

  it('muestra la entrada del menú al SuperAdmin apuntando a la ruta', () => {
    renderSidebar(superAdmin());

    const link = screen.getByText('Errores del cliente').closest('a');
    expect(link?.getAttribute('href')).toBe('/admin/client-errors');
  });
});
