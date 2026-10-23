import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link, useNavigate } from 'react-router';
import { Currency, SalesCommissionStatus } from '@store-mgmt/domain';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { Spinner } from '~/shared/components/ui/spinner';
import { formatCurrency } from '~/shared/lib/format-currency';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { statusLabel } from '~/sales/lib/ordering-labels';
import { gestorLoader } from './loader';
import {
  gestorHttpService,
  type GestorCatalog,
  type GestorCommission,
  type GestorOrder,
} from '../lib/gestor-http-service';

/**
 * T9 — vista del GESTOR de ventas (S3). Vive FUERA del layout del POS: el gestor no tiene tienda
 * ni datos offline, solo sus pedidos, sus comisiones y los catálogos web de las tiendas de su
 * Owner. `gestorLoader` exige sesión y el rol `GestorVentas`.
 */
export const clientLoader = gestorLoader;

export default function GestorDashboardPage() {
  const intl = useIntl();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const [orders, setOrders] = useState<GestorOrder[]>([]);
  const [commissions, setCommissions] = useState<GestorCommission[]>([]);
  const [stores, setStores] = useState<GestorCatalog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // Un fallo parcial no puede vaciar las otras dos secciones (R3-ALL-OR-NOTHING-LOAD).
  const [ordersError, setOrdersError] = useState(false);
  const [commissionsError, setCommissionsError] = useState(false);
  const [storesError, setStoresError] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setOrdersError(false);
    setCommissionsError(false);
    setStoresError(false);

    Promise.allSettled([
      gestorHttpService.getOrders(),
      gestorHttpService.getCommissions(),
      gestorHttpService.getStores(),
    ])
      .then(([ordersResult, commissionsResult, storesResult]) => {
        if (!active) return;

        if (ordersResult.status === 'fulfilled') {
          setOrders(ordersResult.value.data ?? []);
        } else {
          setOrdersError(true);
        }

        if (commissionsResult.status === 'fulfilled') {
          setCommissions(commissionsResult.value.data ?? []);
        } else {
          setCommissionsError(true);
        }

        if (storesResult.status === 'fulfilled') {
          setStores(storesResult.value.data ?? []);
        } else {
          setStoresError(true);
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const formatDate = (value: string) => intl.formatDate(new Date(value), { dateStyle: 'short' });

  return (
    <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text">
            {intl.formatMessage({ id: 'GESTOR.TITLE' })}
          </h1>
          <p className="text-sm text-text-muted">
            {intl.formatMessage({ id: 'GESTOR.SUBTITLE' }, { name: user?.fullName ?? '' })}
          </p>
        </div>
        <Button variant="outline" onClick={handleLogout} data-testid="gestor-logout">
          {intl.formatMessage({ id: 'GESTOR.LOGOUT' })}
        </Button>
      </header>

      {isLoading && <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />}

      {!isLoading && (
        <>
          <Card padding="tight" title={intl.formatMessage({ id: 'GESTOR.CATALOGS' })}>
            {storesError ? (
              <p className="text-sm text-danger" data-testid="gestor-stores-error">
                {intl.formatMessage({ id: 'GESTOR.SECTION_ERROR' })}
              </p>
            ) : stores.length === 0 ? (
              <p className="text-sm text-text-muted">
                {intl.formatMessage({ id: 'GESTOR.CATALOGS_EMPTY' })}
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2" data-testid="gestor-catalogs">
                {stores.map((store) => (
                  <li key={store.storeId}>
                    <Link
                      to={`/catalog/${store.catalogSlug}`}
                      className="inline-flex rounded-md border border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-primary-light"
                    >
                      {store.storeName}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padding="tight" title={intl.formatMessage({ id: 'GESTOR.ORDERS' })}>
            {ordersError ? (
              <p className="text-sm text-danger" data-testid="gestor-orders-error">
                {intl.formatMessage({ id: 'GESTOR.SECTION_ERROR' })}
              </p>
            ) : orders.length === 0 ? (
              <p className="text-sm text-text-muted">
                {intl.formatMessage({ id: 'GESTOR.ORDERS_EMPTY' })}
              </p>
            ) : (
              <div className="overflow-x-auto" data-testid="gestor-orders">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-text-muted">
                    <tr>
                      <th className="py-2 pr-3">{intl.formatMessage({ id: 'GESTOR.CODE' })}</th>
                      <th className="py-2 pr-3">{intl.formatMessage({ id: 'GESTOR.STORE' })}</th>
                      <th className="py-2 pr-3">{intl.formatMessage({ id: 'GESTOR.DATE' })}</th>
                      <th className="py-2 pr-3">{intl.formatMessage({ id: 'GESTOR.STATUS' })}</th>
                      <th className="py-2 text-right">{intl.formatMessage({ id: 'GESTOR.TOTAL' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.orderId} className="border-t border-border">
                        <td className="py-2 pr-3 font-medium text-text">{order.code ?? '—'}</td>
                        <td className="py-2 pr-3">{order.storeName}</td>
                        <td className="py-2 pr-3">{formatDate(order.date)}</td>
                        <td className="py-2 pr-3">{statusLabel(intl, order.status)}</td>
                        <td className="py-2 text-right">
                          {formatCurrency(order.total)} {Currency[order.currency]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card padding="tight" title={intl.formatMessage({ id: 'GESTOR.COMMISSIONS' })}>
            {commissionsError ? (
              <p className="text-sm text-danger" data-testid="gestor-commissions-error">
                {intl.formatMessage({ id: 'GESTOR.SECTION_ERROR' })}
              </p>
            ) : commissions.length === 0 ? (
              <p className="text-sm text-text-muted">
                {intl.formatMessage({ id: 'GESTOR.COMMISSIONS_EMPTY' })}
              </p>
            ) : (
              <div className="overflow-x-auto" data-testid="gestor-commissions">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-text-muted">
                    <tr>
                      <th className="py-2 pr-3">{intl.formatMessage({ id: 'GESTOR.DATE' })}</th>
                      <th className="py-2 pr-3">{intl.formatMessage({ id: 'GESTOR.PRODUCT' })}</th>
                      <th className="py-2 pr-3">{intl.formatMessage({ id: 'GESTOR.CODE' })}</th>
                      <th className="py-2 pr-3">{intl.formatMessage({ id: 'GESTOR.STORE' })}</th>
                      <th className="py-2 pr-3">{intl.formatMessage({ id: 'GESTOR.STATUS' })}</th>
                      <th className="py-2 text-right">{intl.formatMessage({ id: 'GESTOR.AMOUNT' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.map((commission) => (
                      <tr key={commission.id} className="border-t border-border">
                        <td className="py-2 pr-3">{formatDate(commission.orderDate)}</td>
                        <td className="py-2 pr-3">
                          {commission.productName} × {commission.quantity}
                        </td>
                        <td className="py-2 pr-3">{commission.orderCode ?? '—'}</td>
                        <td className="py-2 pr-3">{commission.storeName}</td>
                        <td className="py-2 pr-3">
                          {commission.status === SalesCommissionStatus.Paid
                            ? commission.paidAt
                              ? intl.formatMessage(
                                  { id: 'GESTOR.PAID_AT' },
                                  { date: formatDate(commission.paidAt) },
                                )
                              : intl.formatMessage({ id: 'GESTOR.PAID' })
                            : intl.formatMessage({ id: 'GESTOR.PENDING' })}
                        </td>
                        <td className="py-2 text-right font-medium">
                          {formatCurrency(commission.amount)} {Currency[commission.currency]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
