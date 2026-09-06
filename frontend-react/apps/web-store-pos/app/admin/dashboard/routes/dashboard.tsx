import { useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { usageHttpService } from '~/admin/dashboard/lib/services/usage-http-service';
import { StoreUsageChart } from '~/admin/dashboard/components/store-usage-chart';
import { httpErrorKey } from '~/shared/lib/http/http-error';

export const clientLoader = superAdminLoader;

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function getDiasSemana(today: Date = new Date()): string[] {
  const diaHoy = today.getDay();
  const diaAjustado = diaHoy === 0 ? 6 : diaHoy === 1 ? 0 : diaHoy - 1;
  const result: string[] = [];
  for (let i = 6; i >= 0; i--) {
    result.push(DIAS[(diaAjustado - i + 7) % 7]);
  }
  return result;
}

export function getDias30(): string[] {
  return Array.from({ length: 30 }, (_, i) => String(i + 1));
}

export function AdminDashboardPage() {
  const { formatMessage } = useIntl();
  const [viewType, setViewType] = useState<'7days' | '30days'>('7days');
  const [categories, setCategories] = useState<string[]>([]);
  const [data, setData] = useState<number[]>([]);
  const [activeStoreCount, setActiveStoreCount] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);

  const loadData = useCallback(
    async (view: '7days' | '30days') => {
      setCategories(view === '7days' ? getDiasSemana() : getDias30());
      setData([]);
      setActiveStoreCount(0);
      setError(undefined);
      try {
        const res =
          view === '7days'
            ? await usageHttpService.getStoresLastWeek()
            : await usageHttpService.getStoresLastMonth();
        if (res.succeeded && res.data) {
          setData(res.data.storeUsagesCountDays);
          setActiveStoreCount(res.data.activeStoreCount ?? 0);
        }
      } catch (error) {
        setError(formatMessage({ id: httpErrorKey(error, 'ADMIN_DASHBOARD.ERROR') }));
      }
    },
    [formatMessage],
  );

  const total = data.reduce((sum, value) => sum + value, 0);
  const promedio = data.length > 0 ? total / data.length : 0;
  // Línea horizontal de tiendas activas: ancho proporcional al máximo entre el
  // día más activo del periodo y el conteo actual (evita ancho 0 cuando el
  // conteo supera cualquier día individual).
  const barMax = Math.max(activeStoreCount, ...data, 1);
  const barPercent = Math.min(100, (activeStoreCount / barMax) * 100);

  useEffect(() => {
    loadData('7days');
  }, [loadData]);

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl font-semibold">{formatMessage({ id: 'ADMIN_DASHBOARD.HEADER' })}</h1>
      <section className="rounded border bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-gray-700">
          {formatMessage({ id: 'ADMIN_DASHBOARD.TITLE' })}
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            className={viewType === '7days' ? 'active' : undefined}
            aria-pressed={viewType === '7days'}
            onClick={() => {
              setViewType('7days');
              loadData('7days');
            }}
          >
            {formatMessage({ id: 'ADMIN_DASHBOARD.LAST_7_DAYS' })}
          </button>
          <button
            type="button"
            className={viewType === '30days' ? 'active' : undefined}
            aria-pressed={viewType === '30days'}
            onClick={() => {
              setViewType('30days');
              loadData('30days');
            }}
          >
            {formatMessage({ id: 'ADMIN_DASHBOARD.LAST_30_DAYS' })}
          </button>
        </div>
        {error && <p>{error}</p>}
        {!error && (
          <>
            {/* Línea horizontal con la cantidad de tiendas activas — espejo del
                estilo de tarjeta del dashboard del owner (statistics). */}
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700">
                {`${formatMessage({ id: 'ADMIN_DASHBOARD.ACTIVE_STORES' })}: ${activeStoreCount}`}
              </p>
              <div
                className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200"
                data-testid="admin-active-stores-bar"
              >
                <div
                  className="h-full rounded-full bg-cyan-500"
                  style={{ width: `${barPercent}%` }}
                />
              </div>
            </div>
            {/* Resumen Total | Promedio, igual que las tablas del dashboard del owner. */}
            <p className="mt-4 text-xs text-gray-500">
              {`${formatMessage({ id: 'ADMIN_DASHBOARD.TOTAL' })}: ${total} | ${formatMessage({ id: 'ADMIN_DASHBOARD.AVERAGE' })}: ${promedio.toFixed(2)}`}
            </p>
            {/* Gráfica días (X) vs cantidad de usos (Y) — mismo patrón que las del
                dashboard del owner: lazy wrapper sobre statistics/components/chart-core
                (único archivo con recharts) + fallback de carga + estado vacío. */}
            <div className="mt-2">
              <StoreUsageChart
                data={categories.map((category, i) => ({
                  label: category,
                  value: data[i] || 0,
                }))}
                loadingMessage={formatMessage({ id: 'GENERAL.LOADING' })}
                emptyMessage={formatMessage({ id: 'STATISTICS.EMPTY_STATE' })}
              />
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium text-gray-700">
                      {formatMessage({ id: 'ADMIN_DASHBOARD.COL_CATEGORY' })}
                    </th>
                    <th className="py-2 font-medium text-gray-700">
                      {formatMessage({ id: 'ADMIN_DASHBOARD.COL_VALUE' })}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category, i) => (
                    <tr key={category} className="border-b border-gray-100">
                      <td className="py-1.5 pr-4">{category}</td>
                      <td className="py-1.5">{data[i] || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default AdminDashboardPage;
