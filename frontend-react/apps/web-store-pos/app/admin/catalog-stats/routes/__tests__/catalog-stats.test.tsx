import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { AdminCatalogStatsPage } from '../catalog-stats';

const serviceMock = vi.hoisted(() => ({
  getOverview: vi.fn(),
  getStats: vi.fn(),
}));

vi.mock('../../lib/services/catalog-stats-http-service', async () => {
  const actual = await vi.importActual<
    typeof import('../../lib/services/catalog-stats-http-service')
  >('../../lib/services/catalog-stats-http-service');
  return { ...actual, catalogStatsHttpService: serviceMock };
});

const STORE_ONE = { storeId: 'store-1', name: 'Tienda Uno', visits: 12 };
const STORE_TWO = { storeId: 'store-2', name: 'Tienda Dos', visits: 4 };

function stats(overrides: Record<string, unknown> = {}) {
  return {
    days: 30,
    visits: 12,
    visitors: 9,
    pageViews: 40,
    orders: 3,
    conversionRate: 0.25,
    sources: [
      { source: 0, visits: 7 },
      { source: 1, visits: 5 },
    ],
    topProducts: [{ productId: 'p1', name: 'Camisa azul', views: 8 }],
    daily: [
      { day: '2026-10-19', visits: 4 },
      { day: '2026-10-20', visits: 8 },
    ],
    ...overrides,
  };
}

function overview(overrides: Record<string, unknown> = {}) {
  return {
    totals: stats(),
    stores: [STORE_ONE, STORE_TWO],
    ...overrides,
  };
}

function ok<T>(data: T) {
  return { succeeded: true, data, message: '', actionCode: 200, errors: [] };
}

function failed() {
  return { succeeded: false, data: null, message: 'boom', actionCode: 500, errors: [] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('AdminCatalogStatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceMock.getOverview.mockResolvedValue(ok(overview()));
    serviceMock.getStats.mockResolvedValue(ok(stats()));
  });

  function renderPage() {
    return render(
      <IntlProvider locale="es" messages={esMessages}>
        <AdminCatalogStatsPage />
      </IntlProvider>,
    );
  }

  it('abre en la vista general con el agregado de todas las tiendas', async () => {
    renderPage();

    expect(await screen.findByTestId('catalog-stat-VISITS')).toHaveTextContent('12');
    expect(serviceMock.getOverview).toHaveBeenCalledWith(30);
    expect(serviceMock.getStats).not.toHaveBeenCalled();
    expect(screen.getByTestId('catalog-stats-store')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Todas las tiendas' })).toBeInTheDocument();
  });

  it('muestra en el select solo las tiendas que devuelve el periodo', async () => {
    renderPage();

    await screen.findByTestId('catalog-stat-VISITS');

    const options = screen.getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Todas las tiendas',
      'Tienda Uno',
      'Tienda Dos',
    ]);
  });

  it('hace drill-down a la tienda elegida', async () => {
    serviceMock.getStats.mockResolvedValue(
      ok(stats({ visits: 12, visitors: 9, topProducts: [] })),
    );
    renderPage();
    await screen.findByTestId('catalog-stat-VISITS');

    fireEvent.change(screen.getByTestId('catalog-stats-store'), {
      target: { value: 'store-2' },
    });

    await waitFor(() => expect(serviceMock.getStats).toHaveBeenCalledWith('store-2', 30));
    expect(await screen.findByText('Todavía no hay productos vistos.')).toBeInTheDocument();
  });

  it('recarga el agregado con la ventana de 7 días', async () => {
    renderPage();
    await screen.findByTestId('catalog-stat-VISITS');
    serviceMock.getOverview.mockClear();

    fireEvent.click(screen.getByTestId('catalog-stats-days-7'));

    await waitFor(() => expect(serviceMock.getOverview).toHaveBeenCalledWith(7));
  });

  it('vuelve a la vista general cuando la tienda elegida ya no tiene visitas', async () => {
    renderPage();
    await screen.findByTestId('catalog-stat-VISITS');

    fireEvent.change(screen.getByTestId('catalog-stats-store'), {
      target: { value: 'store-1' },
    });
    await waitFor(() => expect(serviceMock.getStats).toHaveBeenCalled());

    serviceMock.getOverview.mockResolvedValue(ok(overview({ stores: [] })));
    fireEvent.click(screen.getByTestId('catalog-stats-days-7'));

    await waitFor(() => expect(screen.getByTestId('catalog-stats-store')).toHaveValue(''));
    expect(
      await screen.findByText('Ninguna tienda tuvo visitas en este periodo.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('catalog-stat-VISITS')).toHaveTextContent('12');
  });

  it('muestra error cuando falla el agregado', async () => {
    serviceMock.getOverview.mockResolvedValue({
      succeeded: false,
      data: null,
      message: 'boom',
      actionCode: 500,
      errors: [],
    });

    renderPage();

    expect(
      await screen.findByText('No se pudieron cargar las estadísticas.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('catalog-stat-VISITS')).not.toBeInTheDocument();
  });

  it('un fallo transitorio del overview conserva los KPIs y el selector de la última lectura buena', async () => {
    renderPage();
    expect(await screen.findByTestId('catalog-stat-VISITS')).toHaveTextContent('12');

    serviceMock.getOverview.mockResolvedValueOnce(failed());
    fireEvent.click(screen.getByTestId('catalog-stats-days-7'));

    expect(
      await screen.findByText('No se pudieron cargar las estadísticas.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    // El error no oculta la última lectura buena: KPIs y selector siguen visibles.
    expect(screen.getByTestId('catalog-stat-VISITS')).toHaveTextContent('12');
    expect(screen.getByTestId('catalog-stats-store')).toHaveValue('');
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Todas las tiendas',
      'Tienda Uno',
      'Tienda Dos',
    ]);
  });

  it('muestra el estado vacío cuando no hay productos vistos', async () => {
    serviceMock.getOverview.mockResolvedValue(
      ok(overview({ totals: stats({ topProducts: [] }) })),
    );

    renderPage();

    expect(await screen.findByText('Todavía no hay productos vistos.')).toBeInTheDocument();
  });

  it('no deja el spinner encendido cuando llega una respuesta superada', async () => {
    const first = deferred<ReturnType<typeof ok>>();
    serviceMock.getOverview.mockReturnValueOnce(first.promise);
    renderPage();
    await waitFor(() => expect(serviceMock.getOverview).toHaveBeenCalledTimes(1));

    const second = deferred<ReturnType<typeof ok>>();
    serviceMock.getOverview.mockReturnValueOnce(second.promise);
    fireEvent.click(screen.getByTestId('catalog-stats-days-7'));
    await waitFor(() => expect(serviceMock.getOverview).toHaveBeenCalledTimes(2));

    // La respuesta vigente termina primero y la superada después: el contador de cargas pendientes
    // tiene que bajar en las dos, o el spinner no se apaga nunca.
    await act(async () => {
      second.resolve(ok(overview({ totals: stats({ days: 7 }) })));
    });
    await act(async () => {
      first.resolve(ok(overview()));
    });

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByTestId('catalog-stat-VISITS')).toBeInTheDocument();
  });

  it('se recupera de un drill-down fallido al volver a la vista general', async () => {
    renderPage();
    await screen.findByTestId('catalog-stat-VISITS');

    serviceMock.getStats.mockResolvedValueOnce(failed());
    fireEvent.change(screen.getByTestId('catalog-stats-store'), {
      target: { value: 'store-1' },
    });
    expect(
      await screen.findByText('No se pudieron cargar las estadísticas.'),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('catalog-stats-store'), {
      target: { value: '' },
    });

    await waitFor(() =>
      expect(screen.queryByText('No se pudieron cargar las estadísticas.')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('catalog-stat-VISITS')).toHaveTextContent('12');
  });

  it('se recupera de un drill-down fallido al elegir otra tienda', async () => {
    renderPage();
    await screen.findByTestId('catalog-stat-VISITS');

    serviceMock.getStats.mockResolvedValueOnce(failed());
    fireEvent.change(screen.getByTestId('catalog-stats-store'), {
      target: { value: 'store-1' },
    });
    await screen.findByText('No se pudieron cargar las estadísticas.');

    serviceMock.getStats.mockResolvedValueOnce(
      ok(stats({ visits: 4, visitors: 2, pageViews: 5 })),
    );
    fireEvent.change(screen.getByTestId('catalog-stats-store'), {
      target: { value: 'store-2' },
    });

    await waitFor(() => expect(serviceMock.getStats).toHaveBeenLastCalledWith('store-2', 30));
    await waitFor(() =>
      expect(screen.queryByText('No se pudieron cargar las estadísticas.')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('catalog-stat-VISITS')).toHaveTextContent('4');
  });

  it('no re-selecciona sola la tienda que dejó de tener visitas', async () => {
    renderPage();
    await screen.findByTestId('catalog-stat-VISITS');

    fireEvent.change(screen.getByTestId('catalog-stats-store'), {
      target: { value: 'store-1' },
    });
    await waitFor(() => expect(serviceMock.getStats).toHaveBeenCalledWith('store-1', 30));

    serviceMock.getOverview.mockResolvedValueOnce(ok(overview({ stores: [] })));
    fireEvent.click(screen.getByTestId('catalog-stats-days-7'));
    await waitFor(() => expect(screen.getByTestId('catalog-stats-store')).toHaveValue(''));

    serviceMock.getStats.mockClear();
    fireEvent.click(screen.getByTestId('catalog-stats-days-30'));
    await waitFor(() => expect(serviceMock.getOverview).toHaveBeenLastCalledWith(30));

    expect(screen.getByTestId('catalog-stats-store')).toHaveValue('');
    expect(serviceMock.getStats).not.toHaveBeenCalled();
  });

  it('conserva la tienda elegida al cambiar el periodo y pide ambas lecturas con el rango nuevo', async () => {
    renderPage();
    await screen.findByTestId('catalog-stat-VISITS');

    fireEvent.change(screen.getByTestId('catalog-stats-store'), {
      target: { value: 'store-1' },
    });
    await waitFor(() => expect(serviceMock.getStats).toHaveBeenCalledWith('store-1', 30));

    serviceMock.getOverview.mockClear();
    serviceMock.getStats.mockClear();
    // La tienda mantiene visitas en el periodo nuevo, así que la selección debe sobrevivir.
    serviceMock.getOverview.mockResolvedValueOnce(
      ok(overview({ totals: stats({ days: 7, visits: 99 }) })),
    );
    serviceMock.getStats.mockResolvedValueOnce(ok(stats({ days: 7, visits: 5 })));

    fireEvent.click(screen.getByTestId('catalog-stats-days-7'));

    await waitFor(() => expect(serviceMock.getOverview).toHaveBeenCalledWith(7));
    await waitFor(() => expect(serviceMock.getStats).toHaveBeenCalledWith('store-1', 7));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    expect(screen.getByTestId('catalog-stats-store')).toHaveValue('store-1');
    // Se sigue viendo el drill-down, no el agregado.
    expect(screen.getByTestId('catalog-stat-VISITS')).toHaveTextContent(/^5$/);
  });

  it('conserva la tienda elegida si el overview falló mientras estaba elegida', async () => {
    renderPage();
    await screen.findByTestId('catalog-stat-VISITS');

    fireEvent.change(screen.getByTestId('catalog-stats-store'), {
      target: { value: 'store-1' },
    });
    await waitFor(() => expect(serviceMock.getStats).toHaveBeenCalledWith('store-1', 30));

    // Un fallo transitorio del overview ya NO limpia la selección: el overview bueno se conserva.
    serviceMock.getOverview.mockResolvedValueOnce(failed());
    fireEvent.click(screen.getByTestId('catalog-stats-days-7'));
    await waitFor(() => expect(serviceMock.getOverview).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());

    expect(screen.getByTestId('catalog-stats-store')).toHaveValue('store-1');
    expect(serviceMock.getStats).toHaveBeenLastCalledWith('store-1', 7);

    // Y el estado real no se perdió: el periodo anterior la sigue pidiendo con su selección.
    serviceMock.getStats.mockClear();
    fireEvent.click(screen.getByTestId('catalog-stats-days-30'));
    await waitFor(() => expect(serviceMock.getOverview).toHaveBeenLastCalledWith(30));

    expect(screen.getByTestId('catalog-stats-store')).toHaveValue('store-1');
    expect(serviceMock.getStats).toHaveBeenLastCalledWith('store-1', 30);
  });
});
