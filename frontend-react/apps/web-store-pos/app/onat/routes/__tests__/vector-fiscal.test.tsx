import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { ExpenseType } from '@store-mgmt/domain';
import {
  describeOwnerOnlyLoader,
  makeUser,
  renderWithIntl,
  resetOnatRouteSession,
  session,
} from './onat-route-harness';

/**
 * Los doce meses por defecto: ingreso creciente (1.000 … 12.000), gasto fijo de
 * 500 —todo operativo— y sin salarios ni tributos registrados. El total anual
 * de ingresos es 78.000 y el de gastos 6.000, suficiente para fijar el cierre anual.
 */
const fixture = vi.hoisted(() => {
  const makeMonths = () =>
    Array.from({ length: 12 }, (_, month) => ({
      month,
      income: (month + 1) * 1000,
      expenses: 500,
      nonTaxExpenses: 500,
      salaries: 0,
      taxesByType: {} as Record<number, number>,
    }));

  return {
    makeMonths,
    months: makeMonths(),
    warnings: [] as string[],
    skipped: 0,
    overrides: {} as Record<string, Record<string, unknown>>,
  };
});

vi.mock('~/onat/lib/onat-aggregation', () => ({
  aggregateOnatMonths: vi.fn(async () => ({
    months: fixture.months,
    warnings: fixture.warnings,
    skipped: fixture.skipped,
  })),
}));

vi.mock('~/onat/lib/onat-storage', () => ({
  getOnatOverrides: vi.fn(() => fixture.overrides),
  setOnatOverride: vi.fn(() => ({ succeeded: true })),
}));

import { VectorFiscalPage, clientLoader } from '../vector-fiscal';
import { aggregateOnatMonths } from '~/onat/lib/onat-aggregation';
import { getOnatOverrides, setOnatOverride } from '~/onat/lib/onat-storage';

const CURRENT_YEAR = new Date().getFullYear();

function renderPage() {
  return renderWithIntl(<VectorFiscalPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetOnatRouteSession();
  fixture.months = fixture.makeMonths();
  fixture.warnings = [];
  fixture.skipped = 0;
  fixture.overrides = {};
});

describeOwnerOnlyLoader('clientLoader de Vector Fiscal (solo el Owner)', clientLoader);

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

    expect(setOnatOverride).toHaveBeenCalledWith({
      ownerId: 'u1',
      year: CURRENT_YEAR,
      month: 0,
      field: 'ingresos',
      original: 1000,
      value: 290000,
    });
  });

  it('deja la celda con el nuevo valor y el original tras guardar y recargar', async () => {
    session.user = makeUser();
    // El storage simulado devuelve lo guardado, como el localStorage real: tras
    // guardar, la pantalla recarga los overrides y pinta el original congelado.
    vi.mocked(setOnatOverride).mockImplementation((input) => {
      fixture.overrides = {
        [String(input.year)]: {
          [String(input.month)]: {
            [input.field]: {
              original: input.original,
              value: input.value,
              editedAt: '2026-10-27T00:00:00.000Z',
            },
          },
        },
      };
      return { succeeded: true };
    });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar ingresos de enero' }));
    fireEvent.change(screen.getByLabelText('Ingresos de enero'), {
      target: { value: '312500' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ingresos de enero' }));

    expect(getOnatOverrides).toHaveBeenCalledWith('u1');
    expect(
      await screen.findByRole('button', { name: 'Editar ingresos de enero' }),
    ).toHaveTextContent('312.500 (antes 1000)');
  });

  it('muestra un error en español y mantiene la edición cuando el guardado falla', async () => {
    session.user = makeUser();
    vi.mocked(setOnatOverride).mockReturnValueOnce({ succeeded: false });

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar ingresos de enero' }));
    fireEvent.change(screen.getByLabelText('Ingresos de enero'), {
      target: { value: '290000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar ingresos de enero' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo guardar. Revisa el almacenamiento del navegador e inténtalo de nuevo.',
    );
    expect(screen.getByLabelText('Ingresos de enero')).toBeInTheDocument();
  });

  it('no guarda un importe vacío, negativo o no numérico y muestra el mensaje en español', async () => {
    session.user = makeUser();

    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Editar ingresos de enero' }));

    for (const invalidDraft of ['', '-1500', 'mil']) {
      fireEvent.change(screen.getByLabelText('Ingresos de enero'), {
        target: { value: invalidDraft },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar ingresos de enero' }));

      expect(
        screen.getByText('Escribe un importe válido mayor o igual a 0.'),
      ).toBeInTheDocument();
      expect(setOnatOverride).not.toHaveBeenCalled();
    }

    expect(screen.getByLabelText('Ingresos de enero')).toBeInTheDocument();
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

  it('usa el gasto sobrescrito por el Owner en el cierre anual', async () => {
    session.user = makeUser();
    fixture.overrides = {
      [String(CURRENT_YEAR)]: {
        '0': { gastos: { original: 500, value: 5000, editedAt: '2026-10-27T00:00:00.000Z' } },
      },
    };

    renderPage();

    await screen.findAllByRole('row');

    // 78.000 − 39.120 − (5.000 de enero + 11 × 500 de los demás meses) = 28.380.
    expect(screen.getByText('28.380')).toBeInTheDocument();
    expect(screen.getByText('5000 (antes 500)')).toBeInTheDocument();
  });

  it('resta una sola vez el gasto operativo y el tributo pagado en el cierre anual', async () => {
    session.user = makeUser();
    fixture.months = fixture.makeMonths().map((month) =>
      month.month === 0
        ? {
            ...month,
            income: 100_000,
            expenses: 1_500,
            nonTaxExpenses: 500,
            taxesByType: { [ExpenseType.ImpuestoVentas]: 1_000 },
          }
        : { ...month, income: 0, expenses: 0, nonTaxExpenses: 0 },
    );

    renderPage();

    await screen.findAllByRole('row');

    // 100.000 − 39.120 − 500 (gasto operativo) − 1.000 (tributo) = 59.380.
    // Restar el tributo también dentro de `gastos` habría dado 58.380.
    expect(screen.getByText('59.380')).toBeInTheDocument();
  });

  it('muestra los tributos pagados del año con su código ONAT y su importe', async () => {
    session.user = makeUser();
    fixture.months = fixture.makeMonths().map((month) =>
      month.month === 0
        ? {
            ...month,
            taxesByType: {
              [ExpenseType.ImpuestoVentas]: 1_300,
              [ExpenseType.Impuesto]: 250,
            },
          }
        : month,
    );

    renderPage();

    const section = await screen.findByRole('region', { name: 'Tributos pagados' });

    expect(
      within(section).getByText('Impuesto sobre Ventas o Servicios (011402)'),
    ).toBeInTheDocument();
    expect(within(section).getByText('1300')).toBeInTheDocument();
    expect(within(section).getByText('Otros tributos (Sin código)')).toBeInTheDocument();
    expect(within(section).getByText('250')).toBeInTheDocument();
  });

  it('muestra los avisos de la agregación', async () => {
    session.user = makeUser();
    fixture.warnings = ['Tienda s2 omitida: no se pudieron leer sus datos.'];

    renderPage();

    expect(
      await screen.findByText('Tienda s2 omitida: no se pudieron leer sus datos.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/importes sin tasa de cambio disponible/)).not.toBeInTheDocument();
  });

  it('incluye en los avisos los importes sin tasa de cambio disponible', async () => {
    session.user = makeUser();
    fixture.warnings = ['Tienda s2 omitida: no se pudieron leer sus datos.'];
    fixture.skipped = 3;

    renderPage();

    expect(
      await screen.findByText('3 importes sin tasa de cambio disponible'),
    ).toBeInTheDocument();
  });
});
