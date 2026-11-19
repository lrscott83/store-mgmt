import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { ownerHttpService } from '~/admin/owners/lib/services/owner-http-service';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { Spinner } from '~/shared/components/ui/spinner';
import { httpErrorKey } from '~/shared/lib/http/http-error';
import type { Owner } from '@store-mgmt/domain';
import {
  CLIENT_ERRORS_PAGE_SIZE,
  clientErrorsHttpService,
  localDateInputValue,
  localDateRange,
  type StoreClientErrorsPage,
} from '../lib/services/client-errors-http-service';

export const clientLoader = superAdminLoader;

const INPUT_CLASSES = 'rounded border border-border bg-surface px-3 py-2 text-sm text-text';

/**
 * Panel SuperAdmin de errores del cliente POS (`pos-client-error-logs`, specs S7 y S8).
 *
 * El rango por defecto es el DÍA LOCAL del navegador del SuperAdmin: `localDateRange` construye
 * los instantes absolutos con su offset a partir de las partes locales, así que el rango sigue
 * siendo "hoy" para el operador aunque el servidor viva en otra zona. Filtrar por un `Z`
 * asumido o por una fecha desnuda cambiaría el día consultado.
 */
export function AdminClientErrorsPage() {
  const intl = useIntl();
  const { formatMessage, locale } = intl;

  const today = useMemo(() => localDateInputValue(new Date()), []);
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const [ownerId, setOwnerId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [page, setPage] = useState(1);

  const [owners, setOwners] = useState<Owner[]>([]);
  const [data, setData] = useState<StoreClientErrorsPage | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  // El directorio solo alimenta los selectores: un fallo deja la lista usable en vez de
  // vaciar la pantalla, igual que el filtro de tienda de "cobros realizados".
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const result = await ownerHttpService.listOwners({ background: true });
        if (active && result.succeeded) setOwners(result.data);
      } catch {
        // Intencionalmente silencioso: el contenido real de la página son los errores.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Cada cambio de filtro o página lanza una lectura nueva; solo la última puede tocar el estado.
  const latestRequestRef = useRef(0);

  const load = useCallback(async () => {
    latestRequestRef.current += 1;
    const requestId = latestRequestRef.current;
    setLoading(true);
    const range = localDateRange(fromDate, toDate);

    try {
      const result = await clientErrorsHttpService.getErrors({
        ownerId: ownerId || undefined,
        storeId: storeId || undefined,
        from: range.from,
        to: range.to,
        page,
        pageSize: CLIENT_ERRORS_PAGE_SIZE,
      });
      if (requestId !== latestRequestRef.current) return;
      if (!result.succeeded) {
        setData(null);
        setError(formatMessage({ id: 'ADMIN_CLIENT_ERRORS.ERROR' }));
        return;
      }
      setData(result.data);
      setError(undefined);
    } catch (err) {
      if (requestId !== latestRequestRef.current) return;
      setData(null);
      setError(formatMessage({ id: httpErrorKey(err, 'ADMIN_CLIENT_ERRORS.ERROR') }));
    } finally {
      if (requestId === latestRequestRef.current) setLoading(false);
    }
  }, [ownerId, storeId, fromDate, toDate, page, formatMessage]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedOwner = owners.find((owner) => owner.id === ownerId);
  const storeOptions = selectedOwner?.storeModules ?? [];

  /** Cambiar cualquier filtro cambia el conjunto de resultados: la página vuelve a la 1. */
  function changeFilter(apply: () => void) {
    setPage(1);
    apply();
  }

  function selectOwner(value: string) {
    changeFilter(() => {
      setOwnerId(value);
      // La tienda elegida pertenece al owner anterior: no puede sobrevivir al cambio de owner.
      setStoreId('');
    });
  }

  const items = data?.items ?? [];
  const lastPage = data === null ? 1 : Math.max(1, Math.ceil(data.totalCount / data.pageSize));
  const none = formatMessage({ id: 'ADMIN_CLIENT_ERRORS.NONE' });

  const formatOccurredAt = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date);
  };

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl font-semibold">{formatMessage({ id: 'ADMIN_CLIENT_ERRORS.HEADER' })}</h1>

      <Card padding="tight" title={formatMessage({ id: 'ADMIN_CLIENT_ERRORS.FILTERS' })}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm text-text">
            <span>{formatMessage({ id: 'ADMIN_CLIENT_ERRORS.OWNER' })}</span>
            <select
              className={INPUT_CLASSES}
              value={ownerId}
              onChange={(event) => selectOwner(event.target.value)}
              data-testid="client-errors-owner"
            >
              <option value="">{formatMessage({ id: 'ADMIN_CLIENT_ERRORS.ALL_OWNERS' })}</option>
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-text">
            <span>{formatMessage({ id: 'ADMIN_CLIENT_ERRORS.STORE' })}</span>
            <select
              className={INPUT_CLASSES}
              value={storeId}
              disabled={selectedOwner === undefined}
              onChange={(event) =>
                changeFilter(() => setStoreId(event.target.value))
              }
              data-testid="client-errors-store"
            >
              <option value="">{formatMessage({ id: 'ADMIN_CLIENT_ERRORS.ALL_STORES' })}</option>
              {storeOptions.map((store) => (
                <option key={store.storeId} value={store.storeId}>
                  {store.storeName}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm text-text">
            <span>{formatMessage({ id: 'ADMIN_CLIENT_ERRORS.FROM' })}</span>
            <input
              type="date"
              className={INPUT_CLASSES}
              value={fromDate}
              onChange={(event) => changeFilter(() => setFromDate(event.target.value))}
              data-testid="client-errors-from"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-text">
            <span>{formatMessage({ id: 'ADMIN_CLIENT_ERRORS.TO' })}</span>
            <input
              type="date"
              className={INPUT_CLASSES}
              value={toDate}
              onChange={(event) => changeFilter(() => setToDate(event.target.value))}
              data-testid="client-errors-to"
            />
          </label>
        </div>
      </Card>

      {error !== undefined && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      {loading && <Spinner label={formatMessage({ id: 'GENERAL.LOADING' })} />}

      {!loading && error === undefined && data !== null && (
        <p className="text-sm text-text-muted" data-testid="client-errors-total">
          {formatMessage({ id: 'ADMIN_CLIENT_ERRORS.TOTAL' }, { total: data.totalCount })}
        </p>
      )}

      {!loading && error === undefined && data !== null && items.length === 0 && (
        <p className="text-sm text-text-muted">
          {formatMessage({ id: 'ADMIN_CLIENT_ERRORS.EMPTY_STATE' })}
        </p>
      )}

      {!loading && items.length > 0 && (
        <Card padding="tight">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-background">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-text-muted">
                    {formatMessage({ id: 'ADMIN_CLIENT_ERRORS.COL_OWNER' })}
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-text-muted">
                    {formatMessage({ id: 'ADMIN_CLIENT_ERRORS.COL_STORE' })}
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-text-muted">
                    {formatMessage({ id: 'ADMIN_CLIENT_ERRORS.COL_LOG' })}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-4 py-3 align-top" data-testid="client-errors-row-owner">
                      {entry.ownerName ?? none}
                    </td>
                    <td className="px-4 py-3 align-top" data-testid="client-errors-row-store">
                      {entry.storeName ?? none}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium text-text" data-testid="client-errors-row-message">
                        {entry.message}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted">
                        {entry.route !== null && entry.route !== '' && (
                          <span data-testid="client-errors-row-route">{entry.route}</span>
                        )}
                        <span>
                          {formatMessage(
                            { id: 'ADMIN_CLIENT_ERRORS.COUNT' },
                            { count: entry.count },
                          )}
                        </span>
                        <span data-testid="client-errors-row-occurred-at">
                          {formatOccurredAt(entry.occurredAt)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!loading && data !== null && data.totalCount > data.pageSize && (
        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            {formatMessage({ id: 'ADMIN_CLIENT_ERRORS.PREV_PAGE' })}
          </Button>
          <span className="text-xs text-text-muted">
            {formatMessage(
              { id: 'ADMIN_CLIENT_ERRORS.PAGE' },
              { page: data.page, last: lastPage },
            )}
          </span>
          <Button
            variant="outline"
            disabled={page >= lastPage}
            onClick={() => setPage(page + 1)}
          >
            {formatMessage({ id: 'ADMIN_CLIENT_ERRORS.NEXT_PAGE' })}
          </Button>
        </div>
      )}
    </div>
  );
}

export default AdminClientErrorsPage;
