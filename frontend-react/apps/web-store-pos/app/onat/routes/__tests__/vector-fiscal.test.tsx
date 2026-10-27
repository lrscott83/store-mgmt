import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import type { UserModel } from '@store-mgmt/domain';
import esMessages from '~/shared/lib/i18n/es';

/** Sesión mutable: el loader y la página leen la misma sesión que en la app. */
const session = vi.hoisted(() => ({
  user: null as UserModel | null,
  logout: vi.fn(),
}));

vi.mock('~/shared/lib/stores/auth-store', () => ({
  useAuthStore: Object.assign(
    vi.fn((selector?: (state: { user: UserModel | null }) => unknown) =>
      selector ? selector({ user: session.user }) : { user: session.user },
    ),
    {
      getState: () => ({
        user: session.user,
        isAuthenticated: session.user !== null,
        logout: session.logout,
      }),
    },
  ),
}));

/**
 * Los doce meses por defecto: ingreso creciente (1.000 … 12.000), gasto fijo de
 * 500 y sin salarios ni tributos registrados. El total anual de ingresos es
 * 78.000 y el de gastos 6.000, suficiente para fijar el cierre anual.
 */
const fixture = vi.hoisted(() => ({
  months: Array.from({ length: 12 }, (_, month) => ({
    month,
    income: (month + 1) * 1000,
    expenses: 500,
    salaries: 0,
    taxesByType: {} as Record<number, number>,
  })),
  warnings: [] as string[],
  overrides: {} as Record<string, Record<string, unknown>>,
}));

vi.mock('~/onat/lib/onat-aggregation', () => ({
  aggregateOnatMonths: vi.fn(async () => ({
    months: fixture.months,
    warnings: fixture.warnings,
    skipped: 0,
  })),
}));

vi.mock('~/onat/lib/onat-storage', () => ({
  getOnatOverrides: vi.fn(() => fixture.overrides),
  setOnatOverride: vi.fn(),
}));

import { VectorFiscalPage, clientLoader } from '../vector-fiscal';
import { aggregateOnatMonths } from '~/onat/lib/onat-aggregation';
import { setOnatOverride } from '~/onat/lib/onat-storage';

const CURRENT_YEAR = new Date().getFullYear();

function makeUser(overrides: Partial<UserModel> = {}): UserModel {
  return {
    id: 'u1',
    login: 'owner@test.com',
    fullName: 'Owner',
    cellPhone: '+1234567890',
    email: 'owner@test.com',
    isActive: true,
    password: '',
    authToken: 'tok',
    refreshToken: 'ref',
    expiresIn: Date.now() + 1000000,
    roles: [],
    featureIds: [],
    storeModuleIds: [],
    isSuperAdmin: false,
    isOwnerAdmin: true,
    isReSeller: false,
    storeList: [{ id: 's1', name: 'Mi tienda', isActive: true }],
    selectedStoreId: 's1',
    paymentDueDate: null,
    isInTrial: false,
    paymentStatus: 'NoAplica',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <VectorFiscalPage />
    </IntlProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  fixture.warnings = [];
  fixture.overrides = {};
});

describe('clientLoader de Vector Fiscal (solo el Owner)', () => {
  it('deja pasar al Owner', async () => {
    session.user = makeUser();

    await expect(clientLoader()).resolves.toBeNull();
  });

  it('desloguea a un usuario de tienda', async () => {
    session.user = makeUser({ isOwnerAdmin: false });

    const result = await clientLoader();

    expect(session.logout).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
  });

  it('desloguea al SuperAdmin aunque también sea OwnerAdmin', async () => {
    session.user = makeUser({ isSuperAdmin: true, isOwnerAdmin: true });

    const result = await clientLoader();

    expect(session.logout).toHaveBeenCalled();
    expect((result as Response).status).toBe(302);
  });
});

describe('Vector Fiscal (S3, S4, S5, S6, S8)', () => {
  it('muestra los encabezados, el año actual por defecto y doce filas mensuales', async () => {
    session.user = makeUser();

    renderPage();

    const rows = await screen.findAllByRole('row');

    expect(rows).toHaveLength(13);
    const header = within(rows[0]);
    expect(header.getByText('Mes')).toBeInTheDocument();
    expect(header.getByText('Ingresos')).toBeInTheDocument();
    expect(header.getByText('Gastos')).toBeInTheDocument();
    expect(header.getByText('Tributos')).toBeInTheDocument();
    expect(screen.getByLabelText('Año')).toHaveValue(String(CURRENT_YEAR));
    expect(within(rows[1]).getByText('enero')).toBeInTheDocument();
    expect(within(rows[12]).getByText('diciembre')).toBeInTheDocument();
  });

  it('agrega solo las tiendas activas del selector con el año elegido', async () => {
    session.user = makeUser({
      storeList: [
        { id: 's1', name: 'Activa', isActive: true },
        { id: 's2', name: 'Inactiva', isActive: false },
        { id: 's3', name: 'Sin dato', isActive: undefined },
      ],
    });

    renderPage();

    await screen.findAllByRole('row');

    expect(aggregateOnatMonths).toHaveBeenCalledWith({
      storeIds: ['s1', 's3'],
      year: CURRENT_YEAR,
    });
  });

  it('muestra el override con el original congelado entre paréntesis', async () => {
    session.user = makeUser();
    fixture.overrides = {
      [String(CURRENT_YEAR)]: {
        '0': { ingresos: { original: 298000, value: 312500, editedAt: '2026-01-10T00:00:00.000Z' } },
      },
    };

    renderPage();

    expect(await screen.findByText('312.500 (antes 298.000)')).toBeInTheDocument();
  });

  it('guarda un nuevo valor llamando al storage con el agregado vigente como original', async () => {
    session.user = makeUser();

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar ingresos de enero' }));
    fireEvent.change(screen.getByLabelText('Ingresos de enero'), {
      target: { value: '290000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ingresos de enero' }));

    expect(setOnatOverride).toHaveBeenCalledWith(
      'u1',
      CURRENT_YEAR,
      0,
      'ingresos',
      1000,
      290000,
    );
  });

  it('calcula los tributos del mes sobre el ingreso vigente', async () => {
    session.user = makeUser();

    renderPage();

    const rows = await screen.findAllByRole('row');
    // Enero: ingreso 1.000 → 10 % de ventas = 100; la cuota mensual no supera
    // el umbral de 3.260 y no hay salarios.
    expect(within(rows[1]).getAllByRole('cell')[3]).toHaveTextContent('100');
  });

  it('muestra el cierre anual calculado con los totales del año', async () => {
    session.user = makeUser();

    renderPage();

    await screen.findAllByRole('row');

    // 78.000 de ingresos − 39.120 de mínimo exento − 6.000 de gastos.
    expect(screen.getByText('32.880')).toBeInTheDocument();
  });

  it('muestra los avisos de la agregación', async () => {
    session.user = makeUser();
    fixture.warnings = ['Tienda s2 omitida: no se pudieron leer sus datos.'];

    renderPage();

    expect(
      await screen.findByText('Tienda s2 omitida: no se pudieron leer sus datos.'),
    ).toBeInTheDocument();
  });
});
