import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Store } from '@store-mgmt/domain';
import { superAdminLoader } from '~/auth/routes/loaders';
import { Card } from '~/shared/components/ui/card';
import { Spinner } from '~/shared/components/ui/spinner';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import {
  CatalogSourceKind,
  catalogStatsHttpService,
  type CatalogStats,
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

function formatDay(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
}

export function AdminCatalogStatsPage() {
  const { formatMessage } = useIntl();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [days, setDays] = useState<number>(30);
  const [stats, setStats] = useState<CatalogStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void catalogStatsHttpService
      .listStores()
      .then((result) => {
        if (!active) return;
        const list = result.succeeded ? result.data : [];
        setStores(list);
        if (list.length > 0) setStoreId((current) => current || list[0].id);
      })
      .catch(() => {
        if (active) setError(formatMessage({ id: 'ADMIN_CATALOG_STATS.ERROR' }));
      });
    return () => {
      active = false;
    };
  }, [formatMessage]);

  const loadStats = useCallback(
    async (selectedStoreId: string, range: number) => {
      setLoading(true);
      setError(undefined);
      try {
        const result = await catalogStatsHttpService.getStats(selectedStoreId, range);
        if (result.succeeded) {
          setStats(result.data);
        } else {
          setStats(null);
          setError(formatMessage({ id: 'ADMIN_CATALOG_STATS.ERROR' }));
        }
      } catch (err) {
        setStats(null);
        setError(formatMessage({ id: httpErrorKey(err, 'ADMIN_CATALOG_STATS.ERROR') }));
      } finally {
        setLoading(false);
      }
    },
    [formatMessage],
  );

  useEffect(() => {
    if (storeId) void loadStats(storeId, days);
  }, [storeId, days, loadStats]);

  const maxDailyVisits = useMemo(
    () => Math.max(1, ...(stats?.daily.map((day) => day.visits) ?? [0])),
    [stats],
  );
  const maxSourceVisits = useMemo(
    () => Math.max(1, ...(stats?.sources.map((source) => source.visits) ?? [0])),
    [stats],
  );

  const selectedStore = stores.find((store) => store.id === storeId);

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
              value={storeId}
              onChange={(event) => setStoreId(event.target.value)}
              data-testid="catalog-stats-store"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
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

      {!loading && !error && stats && (
        <>
          <Card
            padding="tight"
            title={formatMessage(
              { id: 'ADMIN_CATALOG_STATS.SUMMARY_TITLE' },
              { store: selectedStore?.name ?? '', days: stats.days },
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
                  title={`${formatDay(day.day)}: ${day.visits}`}
                />
              ))}
            </div>
            {stats.daily.length > 0 && (
              <div className="mt-2 flex justify-between text-xs text-text-muted">
                <span>{formatDay(stats.daily[0].day)}</span>
                <span>{formatDay(stats.daily[stats.daily.length - 1].day)}</span>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default AdminCatalogStatsPage;
