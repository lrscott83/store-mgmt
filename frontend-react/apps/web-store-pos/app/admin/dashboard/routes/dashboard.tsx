import { useState, useEffect, useCallback } from 'react';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { usageHttpService } from '~/admin/dashboard/lib/services/usage-http-service';

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
  const [error, setError] = useState<string | undefined>(undefined);

  const loadData = useCallback(
    async (view: '7days' | '30days') => {
      setCategories(view === '7days' ? getDiasSemana() : getDias30());
      setData([]);
      setError(undefined);
      try {
        const res =
          view === '7days'
            ? await usageHttpService.getStoresLastWeek()
            : await usageHttpService.getStoresLastMonth();
        if (res.succeeded && res.data) {
          setData(res.data.storeUsagesCountDays);
        }
      } catch {
        setError(formatMessage({ id: 'ADMIN_DASHBOARD.ERROR' }));
      }
    },
    [formatMessage],
  );

  useEffect(() => {
    loadData('7days');
  }, [loadData]);

  return (
    <div>
      <h1>{formatMessage({ id: 'ADMIN_DASHBOARD.HEADER' })}</h1>
      <h2>{formatMessage({ id: 'ADMIN_DASHBOARD.TITLE' })}</h2>
      <div>
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
        <table>
          <thead>
            <tr>
              <th>{formatMessage({ id: 'ADMIN_DASHBOARD.COL_CATEGORY' })}</th>
              <th>{formatMessage({ id: 'ADMIN_DASHBOARD.COL_VALUE' })}</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category, i) => (
              <tr key={category}>
                <td>{category}</td>
                <td>{data[i] || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default AdminDashboardPage;
