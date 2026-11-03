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
    skipped: { withoutRate: 0, undated: 0 },
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
import { crearVectorVacio, getOnatVector, saveOnatVector } from '~/onat/lib/onat-vector';
import type { OnatObligacion } from '~/onat/lib/onat-vector';

const CURRENT_YEAR = new Date().getFullYear();
const OWNER_ID = 'u1';

function renderPage() {
  return renderWithIntl(<VectorFiscalPage />);
}

type ObligacionSeed = Partial<OnatObligacion> & Pick<OnatObligacion, 'periodo' | 'codigo'>;

/** Siembra el vector real del año; la pantalla lo lee con `getOnatVector`. */
function seedAgenda(year: number, obligaciones: readonly ObligacionSeed[]): void {
  const vector = crearVectorVacio(OWNER_ID, year);
  saveOnatVector({
    ...vector,
    obligaciones: obligaciones.map((obligacion) => ({
      periodo: obligacion.periodo,
      vence: obligacion.vence ?? `${year}-02-10`,
      codigo: obligacion.codigo,
      importe: obligacion.importe ?? null,
      porcentaje: obligacion.porcentaje ?? null,
      base: obligacion.base ?? 'fija',
      rc04a: obligacion.rc04a ?? '10012',
      pagado: obligacion.pagado ?? false,
      canalPago: obligacion.canalPago ?? null,
    })),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetOnatRouteSession();
  fixture.months = fixture.makeMonths();
  fixture.warnings = [];
  fixture.skipped = { withoutRate: 0, undated: 0 };
  fixture.overrides = {};
  // `clearAllMocks` limpia las llamadas pero no la implementación: cada prueba
  // reinstala la agregación por defecto para no heredar la de una anterior.
  vi.mocked(aggregateOnatMonths).mockImplementation(async () => ({
    months: fixture.months,
    warnings: fixture.warnings,
    skipped: fixture.skipped,
  }));
});

describeOwnerOnlyLoader('clientLoader de Vector Fiscal (solo el Owner)', clientLoader);

describe('módulo ONAT (módulo 22)', () => {
  it('desloguea al Owner cuando el módulo Onat no está disponible', async () => {
    session.user = makeUser({ storeModuleIds: [] });

    const result = await clientLoader();

    expect(session.logout).toHaveBeenCalled();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get('Location')).toBe('/login');
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

  it('usa la tienda seleccionada cuando la sesión no trae lista de tiendas', async () => {
    session.user = makeUser({ storeList: undefined, selectedStoreId: 's9' });

    renderPage();

    await screen.findAllByRole('row');

    expect(aggregateOnatMonths).toHaveBeenCalledWith({
      storeIds: ['s9'],
      year: CURRENT_YEAR,
    });
  });

  it('vuelve a agregar al cambiar el año y muestra las filas y el cierre del año elegido', async () => {
    session.user = makeUser();
    const previousYear = CURRENT_YEAR - 1;
    const previousMonths = Array.from({ length: 12 }, (_, month) => ({
      month,
      income: 10_000,
      expenses: 0,
      nonTaxExpenses: 0,
      salaries: 0,
      taxesByType: {},
    }));
    vi.mocked(aggregateOnatMonths).mockImplementation(async ({ year }) => ({
      months: year === previousYear ? previousMonths : fixture.months,
      warnings: [],
      skipped: { withoutRate: 0, undated: 0 },
    }));

    renderPage();

    await screen.findAllByRole('row');
    expect(aggregateOnatMonths).toHaveBeenLastCalledWith({
      storeIds: ['s1'],
      year: CURRENT_YEAR,
    });

    fireEvent.change(screen.getByLabelText('Año'), {
      target: { value: String(previousYear) },
    });

    // La agregación se vuelve a invocar con el año elegido, no reutiliza la del año actual.
    expect(aggregateOnatMonths).toHaveBeenCalledTimes(2);
    expect(aggregateOnatMonths).toHaveBeenLastCalledWith({
      storeIds: ['s1'],
      year: previousYear,
    });
    expect(screen.getByLabelText('Año')).toHaveValue(String(previousYear));

    // Año anterior: 12 × 10.000 de ingreso − 39.120 de mínimo exento = 80.880.
    expect(await screen.findByText('80.880')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getAllByRole('cell')[1]).toHaveTextContent('10.000');
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

  it('no descuenta dos veces cuando hay override de gasto en un mes con tributos', async () => {
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
    fixture.overrides = {
      [String(CURRENT_YEAR)]: {
        '0': { gastos: { original: 500, value: 800, editedAt: '2026-10-27T00:00:00.000Z' } },
      },
    };

    renderPage();

    await screen.findAllByRole('row');

    // La celda muestra el gasto deducible sobrescrito, no el total con tributos.
    expect(screen.getByText('800 (antes 500)')).toBeInTheDocument();
    // 100.000 − 39.120 − 800 (override) − 1.000 (tributo) = 59.080.
    expect(screen.getByText('59.080')).toBeInTheDocument();
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
    fixture.skipped = { withoutRate: 3, undated: 0 };

    renderPage();

    expect(
      await screen.findByText('3 importes sin tasa de cambio disponible'),
    ).toBeInTheDocument();
  });

  it('informa por separado los registros sin fecha válida', async () => {
    session.user = makeUser();
    fixture.skipped = { withoutRate: 0, undated: 2 };

    renderPage();

    expect(await screen.findByText('2 registros sin fecha válida')).toBeInTheDocument();
    expect(screen.queryByText(/sin tasa de cambio disponible/)).not.toBeInTheDocument();
  });

  it('muestra un error en español y permite reintentar cuando la agregación falla', async () => {
    session.user = makeUser();
    vi.mocked(aggregateOnatMonths).mockRejectedValueOnce(new Error('storage failure'));

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo cargar el Vector Fiscal. Revisa el almacenamiento del navegador e inténtalo de nuevo.',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findAllByRole('row')).toHaveLength(13);
  });
});

describe('Agenda de obligaciones (S2, S3, S4, S5)', () => {
  it('muestra la agenda del año con sus períodos, códigos y RC-04A', async () => {
    session.user = makeUser();
    seedAgenda(CURRENT_YEAR, [
      {
        periodo: `${CURRENT_YEAR}-01`,
        vence: `${CURRENT_YEAR}-02-10`,
        codigo: '0114022',
        rc04a: '30016',
        importe: 1200,
      },
      {
        periodo: `${CURRENT_YEAR}-Q1`,
        vence: `${CURRENT_YEAR}-04-20`,
        codigo: '0820132',
        rc04a: '00206',
        importe: 5000,
      },
    ]);

    renderPage();

    const agenda = await screen.findByRole('region', { name: 'Agenda de obligaciones' });

    expect(
      within(agenda).getByRole('heading', { name: `${CURRENT_YEAR}-01` }),
    ).toBeInTheDocument();
    expect(
      within(agenda).getByRole('heading', { name: `${CURRENT_YEAR}-Q1` }),
    ).toBeInTheDocument();
    expect(within(agenda).getByText('0114022')).toBeInTheDocument();
    expect(within(agenda).getByText('30016')).toBeInTheDocument();
    expect(within(agenda).getByText('0820132')).toBeInTheDocument();
    expect(within(agenda).getByText('00206')).toBeInTheDocument();
    expect(within(agenda).getByText(`${CURRENT_YEAR}-02-10`)).toBeInTheDocument();
    expect(within(agenda).getByText(`${CURRENT_YEAR}-04-20`)).toBeInTheDocument();
  });

  it('usa el importe fijo y calcula la base por el porcentaje cuando no lo trae', async () => {
    session.user = makeUser();
    seedAgenda(CURRENT_YEAR, [
      { periodo: `${CURRENT_YEAR}-01`, codigo: '0114022', importe: 1200 },
      {
        periodo: `${CURRENT_YEAR}-01`,
        codigo: '0530222',
        porcentaje: 0.1,
        base: 'ingresos',
      },
    ]);

    renderPage();

    const agenda = await screen.findByRole('region', { name: 'Agenda de obligaciones' });

    expect(within(agenda).getByText('1200')).toBeInTheDocument();
    // Enero ingresa 1.000: 10 % = 100.
    expect(within(agenda).getByText('100')).toBeInTheDocument();
  });

  it('calcula una obligación trimestral sobre los tres meses del trimestre', async () => {
    session.user = makeUser();
    seedAgenda(CURRENT_YEAR, [
      {
        periodo: `${CURRENT_YEAR}-Q1`,
        codigo: '0530222',
        porcentaje: 0.1,
        base: 'ingresos',
      },
      {
        periodo: `${CURRENT_YEAR}-A`,
        codigo: '0820132',
        porcentaje: 0.1,
        base: 'ingresos',
      },
    ]);

    renderPage();

    const agenda = await screen.findByRole('region', { name: 'Agenda de obligaciones' });

    // Enero + febrero + marzo = 1.000 + 2.000 + 3.000 = 6.000; 10 % = 600.
    expect(within(agenda).getByText('600')).toBeInTheDocument();
    // Los doce meses suman 78.000; 10 % = 7.800.
    expect(within(agenda).getByText('7800')).toBeInTheDocument();
  });

  it('calcula el porcentaje sobre el ingreso con el override del Owner', async () => {
    session.user = makeUser();
    fixture.overrides = {
      [String(CURRENT_YEAR)]: {
        '0': {
          ingresos: { original: 1000, value: 2000, editedAt: '2026-10-27T00:00:00.000Z' },
        },
      },
    };
    seedAgenda(CURRENT_YEAR, [
      {
        periodo: `${CURRENT_YEAR}-01`,
        codigo: '0530222',
        porcentaje: 0.1,
        base: 'ingresos',
      },
    ]);

    renderPage();

    const agenda = await screen.findByRole('region', { name: 'Agenda de obligaciones' });

    // El ingreso vigente de enero es el override (2.000), no el agregado (1.000).
    expect(within(agenda).getByText('200')).toBeInTheDocument();
    expect(within(agenda).queryByText('100')).not.toBeInTheDocument();
  });

  it('usa los salarios del período como base del tributo de fuerza de trabajo', async () => {
    session.user = makeUser();
    fixture.months = fixture
      .makeMonths()
      .map((month) => (month.month === 0 ? { ...month, salaries: 25_000 } : month));
    seedAgenda(CURRENT_YEAR, [
      {
        periodo: `${CURRENT_YEAR}-01`,
        codigo: '0510122',
        porcentaje: 0.05,
        base: 'salarios',
      },
    ]);

    renderPage();

    const agenda = await screen.findByRole('region', { name: 'Agenda de obligaciones' });

    // 25.000 × 5 % = 1.250.
    expect(within(agenda).getByText('1250')).toBeInTheDocument();
  });

  it('muestra pendiente de declarar cuando no hay importe ni porcentaje', async () => {
    session.user = makeUser();
    seedAgenda(CURRENT_YEAR, [
      { periodo: `${CURRENT_YEAR}-A`, codigo: '0530222' },
    ]);

    renderPage();

    const agenda = await screen.findByRole('region', { name: 'Agenda de obligaciones' });

    expect(within(agenda).getByText('Pendiente de declarar')).toBeInTheDocument();
  });

  it('marca pagada, registra el canal y lo limpia al volver a pendiente', async () => {
    session.user = makeUser();
    seedAgenda(CURRENT_YEAR, [
      { periodo: `${CURRENT_YEAR}-01`, codigo: '0114022', importe: 1200 },
    ]);

    renderPage();

    const agenda = await screen.findByRole('region', { name: 'Agenda de obligaciones' });

    fireEvent.click(
      within(agenda).getByRole('button', {
        name: `Marcar pagada la obligación 0114022 de ${CURRENT_YEAR}-01`,
      }),
    );

    expect(
      await within(agenda).findByRole('button', {
        name: `Registrar pago electrónico de la obligación 0114022 de ${CURRENT_YEAR}-01`,
      }),
    ).toBeInTheDocument();
    // El descuento del 3 % solo aplica al pago por pasarela: se explica al preguntar.
    expect(
      within(agenda).getByText(
        'El 3 % de descuento solo aplica a los pagos por Transfermóvil, Telebanca, banca remota o cajero. Pagar en efectivo en el banco no tiene descuento, por eso la aplicación necesita saber cómo pagaste.',
      ),
    ).toBeInTheDocument();

    const soloPagada = getOnatVector(OWNER_ID, CURRENT_YEAR).obligaciones[0];
    expect(soloPagada.pagado).toBe(true);
    expect(soloPagada.canalPago).toBeNull();

    fireEvent.click(
      within(agenda).getByRole('button', {
        name: `Registrar pago electrónico de la obligación 0114022 de ${CURRENT_YEAR}-01`,
      }),
    );

    expect(
      await within(agenda).findByText('Pagado electrónicamente'),
    ).toBeInTheDocument();
    expect(getOnatVector(OWNER_ID, CURRENT_YEAR).obligaciones[0].canalPago).toBe(
      'electronico',
    );

    fireEvent.click(
      within(agenda).getByRole('button', {
        name: `Marcar pendiente la obligación 0114022 de ${CURRENT_YEAR}-01`,
      }),
    );

    expect(await within(agenda).findByText('Pendiente')).toBeInTheDocument();
    const despues = getOnatVector(OWNER_ID, CURRENT_YEAR).obligaciones[0];
    expect(despues.pagado).toBe(false);
    expect(despues.canalPago).toBeNull();
  });

  it('carga la agenda del año elegido al cambiar de ejercicio', async () => {
    session.user = makeUser();
    const previousYear = CURRENT_YEAR - 1;
    seedAgenda(CURRENT_YEAR, [
      { periodo: `${CURRENT_YEAR}-01`, codigo: '0114022', importe: 1200 },
    ]);
    seedAgenda(previousYear, [
      { periodo: `${previousYear}-02`, codigo: '0820132', importe: 4500 },
    ]);

    renderPage();

    const agenda = await screen.findByRole('region', { name: 'Agenda de obligaciones' });
    expect(within(agenda).getByText('0114022')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Año'), {
      target: { value: String(previousYear) },
    });

    const updatedAgenda = await screen.findByRole('region', {
      name: 'Agenda de obligaciones',
    });
    expect(within(updatedAgenda).getByText('0820132')).toBeInTheDocument();
    expect(within(updatedAgenda).queryByText('0114022')).not.toBeInTheDocument();
  });
});
