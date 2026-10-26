import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { Card } from '~/shared/components/ui/card';
import { Spinner } from '~/shared/components/ui/spinner';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import {
  CatalogSourceKind,
  catalogStatsHttpService,
  type CatalogStats,
  type CatalogStatsOverview,
} from '../lib/services/catalog-stats-http-service';

export const clientLoader = superAdminLoader;

const DAY_OPTIONS = [7, 30] as const;

const SOURCE_LABEL_IDS: Record<CatalogSourceKind, string> = {
  [CatalogSourceKind.Direct]: 'ADMIN_CATALOG_STATS.SOURCE_DIRECT',
  [CatalogSourceKind.WhatsApp]: 'ADMIN_CATALOG_STATS.SOURCE_WHATSAPP',
  [CatalogSourceKind.Instagram]: 'ADMIN_CATALOG_STATS.SOURCE_INSTAGRAM',
  [CatalogSourceKind.Facebook]: 'ADMIN_CATALOG_STATS.SOURCE_FACEBOOK',
  [CatalogSourceKind.Google]: 'ADMIN_CATALOG_STATS.SOURCE_GOOGLE',
  [CatalogSourceKind.OtherSearch]: 'ADMIN_CATALOG_STATS.SOURCE_OTHER_SEARCH',
  [CatalogSourceKind.Referral]: 'ADMIN_CATALOG_STATS.SOURCE_REFERRAL',
  [CatalogSourceKind.Campaign]: 'ADMIN_CATALOG_STATS.SOURCE_CAMPAIGN',
};

function formatDay(value: string, locale: string): string {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function AdminCatalogStatsPage() {
  const { formatMessage, locale } = useIntl();
  // `''` es la vista GENERAL: el agregado de todas las tiendas.
  const [storeId, setStoreId] = useState('');
  const [days, setDays] = useState<number>(30);
  const [overview, setOverview] = useState<CatalogStatsOverview | null>(null);
  const [storeStats, setStoreStats] = useState<CatalogStats | null>(null);
  const [loading, setLoading] = useState(false);
  // Un error por lectura: el de un drill-down no puede ocultar la vista general ni al revés.
  const [overviewError, setOverviewError] = useState<string | undefined>(undefined);
  const [storeError, setStoreError] = useState<string | undefined>(undefined);
  const overviewRequest = useRef(0);
  const storeRequest = useRef(0);
  // Dos lecturas corren en paralelo al cambiar el periodo; el spinner se apaga cuando terminan las dos.
  const pending = useRef(0);

  const begin = useCallback(() => {
    pending.current += 1;
    setLoading(true);
  }, []);

  // Cada `begin()` tiene exactamente un `end()`, incluso si la respuesta llega superada: el
  // contador no puede quedarse colgado (un `end()` condicionado al request vigente filtraba una
  // unidad por cada cancelación y dejaba el spinner encendido para siempre).
  const end = useCallback(() => {
    pending.current = Math.max(0, pending.current - 1);
    if (pending.current === 0) setLoading(false);
  }, []);

  const loadOverview = useCallback(
    async (range: number) => {
      const current = ++overviewRequest.current;
      begin();
      setOverviewError(undefined);
      try {
        const result = await catalogStatsHttpService.getOverview(range);
        if (current !== overviewRequest.current) return;
        if (result.succeeded) {
          setOverview(result.data);
        } else {
          // Un fallo transitorio no invalida la última lectura buena: los KPIs, el selector y la
          // tienda elegida siguen siendo válidos y se muestran junto al error.
          setOverviewError(formatMessage({ id: 'ADMIN_CATALOG_STATS.ERROR' }));
        }
      } catch (err) {
        if (current !== overviewRequest.current) return;
        setOverviewError(formatMessage({ id: httpErrorKey(err, 'ADMIN_CATALOG_STATS.ERROR') }));
      } finally {
        end();
      }
    },
    [begin, end, formatMessage],
  );

  const loadStoreStats = useCallback(
    async (selectedStoreId: string, range: number) => {
      const current = ++storeRequest.current;
      begin();
      setStoreError(undefined);
      try {
        const result = await catalogStatsHttpService.getStats(selectedStoreId, range);
        if (current !== storeRequest.current) return;
        if (result.succeeded) {
          setStoreStats(result.data);
        } else {
          setStoreStats(null);
          setStoreError(formatMessage({ id: 'ADMIN_CATALOG_STATS.ERROR' }));
        }
      } catch (err) {
        if (current !== storeRequest.current) return;
        setStoreStats(null);
        setStoreError(formatMessage({ id: httpErrorKey(err, 'ADMIN_CATALOG_STATS.ERROR') }));
      } finally {
        end();
      }
    },
    [begin, end, formatMessage],
  );

  useEffect(() => {
    void loadOverview(days);
  }, [days, loadOverview]);

  useEffect(() => {
    if (storeId) void loadStoreStats(storeId, days);
  }, [storeId, days, loadStoreStats]);

  // La selección solo se limpia cuando un overview EXITOSO ya no contiene la tienda (dejó de tener
  // visitas en el periodo). Ya no hace falta una rama de "overview falló": `loadOverview` conserva
  // la última lectura buena ante un error transitorio, así que un fallo no invalida la selección.
  useEffect(() => {
    if (!storeId || !overview) return;
    if (!overview.stores.some((store) => store.storeId === storeId)) setStoreId('');
  }, [storeId, overview]);

  const selectedStore = overview?.stores.find((store) => store.storeId === storeId);
  const effectiveStoreId = selectedStore ? storeId : '';
  const stats = selectedStore ? storeStats : overview?.totals ?? null;
  const error = selectedStore ? storeError : overviewError;
  const storeName = selectedStore
    ? selectedStore.name
    : formatMessage({ id: 'ADMIN_CATALOG_STATS.ALL_STORES' });

  const maxDailyVisits = useMemo(
    () => Math.max(1, ...(stats?.daily.map((day) => day.visits) ?? [0])),
    [stats],
  );
  const maxSourceVisits = useMemo(
    () => Math.max(1, ...(stats?.sources.map((source) => source.visits) ?? [0])),
    [stats],
  );

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl font-semibold">
        {formatMessage({ id: 'ADMIN_CATALOG_STATS.HEADER' })}
      </h1>

      <Card padding="tight" title={formatMessage({ id: 'ADMIN_CATALOG_STATS.FILTERS' })}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>{formatMessage({ id: 'ADMIN_CATALOG_STATS.STORE' })}</span>
            <select
              className="rounded border px-3 py-2"
              value={effectiveStoreId}
              onChange={(event) => setStoreId(event.target.value)}
              data-testid="catalog-stats-store"
            >
              <option value="">{formatMessage({ id: 'ADMIN_CATALOG_STATS.ALL_STORES' })}</option>
              {overview?.stores.map((store) => (
                <option key={store.storeId} value={store.storeId}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            {DAY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={days === option ? 'active' : undefined}
                aria-pressed={days === option}
                onClick={() => setDays(option)}
                data-testid={`catalog-stats-days-${option}`}
              >
                {formatMessage({ id: 'ADMIN_CATALOG_STATS.LAST_DAYS' }, { days: option })}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <Spinner label={formatMessage({ id: 'GENERAL.LOADING' })} />}

      {!loading && !error && overview && overview.stores.length === 0 && (
        <p className="text-sm text-text-muted">
          {formatMessage({ id: 'ADMIN_CATALOG_STATS.NO_STORES_WITH_VISITS' })}
        </p>
      )}

      {!loading && stats && (
        <>
          <Card
            padding="tight"
            title={formatMessage(
              { id: 'ADMIN_CATALOG_STATS.SUMMARY_TITLE' },
              { store: storeName, days: stats.days },
            )}
          >
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                { id: 'VISITS', value: stats.visits },
                { id: 'VISITORS', value: stats.visitors },
                { id: 'PAGE_VIEWS', value: stats.pageViews },
                { id: 'ORDERS', value: stats.orders },
                {
                  id: 'CONVERSION',
                  value: `${(stats.conversionRate * 100).toFixed(1)}%`,
                },
              ].map((item) => (
                <div key={item.id} className="rounded-md bg-surface-hover px-3 py-2">
                  <div className="text-xs text-text-muted">
                    {formatMessage({ id: `ADMIN_CATALOG_STATS.${item.id}` })}
                  </div>
                  <div className="text-xl font-semibold" data-testid={`catalog-stat-${item.id}`}>
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card padding="tight" title={formatMessage({ id: 'ADMIN_CATALOG_STATS.SOURCES' })}>
              <ul className="space-y-2">
                {stats.sources.map((source) => (
                  <li key={source.source} className="text-sm">
                    <div className="flex justify-between">
                      <span>{formatMessage({ id: SOURCE_LABEL_IDS[source.source] })}</span>
                      <span className="font-semibold" data-testid={`catalog-source-${source.source}`}>
                        {source.visits}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full bg-cyan-500"
                        style={{ width: `${(source.visits / maxSourceVisits) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card padding="tight" title={formatMessage({ id: 'ADMIN_CATALOG_STATS.TOP_PRODUCTS' })}>
              {stats.topProducts.length === 0 ? (
                <p className="text-sm text-text-muted">
                  {formatMessage({ id: 'ADMIN_CATALOG_STATS.NO_PRODUCTS' })}
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {stats.topProducts.map((product) => (
                    <li key={product.productId} className="flex justify-between gap-3">
                      <span className="truncate">{product.name || product.productId}</span>
                      <span className="shrink-0 font-semibold">{product.views}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card padding="tight" title={formatMessage({ id: 'ADMIN_CATALOG_STATS.DAILY' })}>
            <div className="flex h-28 items-end gap-1" data-testid="catalog-stats-daily">
              {stats.daily.map((day) => (
                <div
                  key={day.day}
                  className="min-w-1 flex-1 rounded-t bg-cyan-500"
                  style={{ height: `${Math.max(2, (day.visits / maxDailyVisits) * 100)}%` }}
                  title={`${formatDay(day.day, locale)}: ${day.visits}`}
                />
              ))}
            </div>
            {stats.daily.length > 0 && (
              <div className="mt-2 flex justify-between text-xs text-text-muted">
                <span>{formatDay(stats.daily[0].day, locale)}</span>
                <span>{formatDay(stats.daily[stats.daily.length - 1].day, locale)}</span>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default AdminCatalogStatsPage;
