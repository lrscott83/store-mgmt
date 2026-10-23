import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import {
  Currency,
  EFeatures,
  SalesCommissionStatus,
} from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { Spinner } from '~/shared/components/ui/spinner';
import { confirmDialog, showBlockingError } from '~/shared/lib/blocking-alert';
import { formatCurrency } from '~/shared/lib/format-currency';
import { showToastSuccess } from '~/shared/lib/toast';
import {
  ownerCommissionsHttpService,
  type OwnerSalesCommission,
  type SalesManagerOption,
} from '../lib/owner-commissions-http-service';

/**
 * Guard de UI: módulo 21 + feature 125 para el menú/loader. El backend exige OwnerAdmin y NO
 * gatea este listado por el módulo a propósito (S10): al desactivarlo, las comisiones pendientes
 * siguen siendo pagables y el Owner tiene que poder verlas.
 */
export const clientLoader = featureLoader([EFeatures.GestoresVentas]);

const INPUT_CLASSES =
  'rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary';

type StatusFilter = 'all' | SalesCommissionStatus;

/**
 * T10: el Owner revisa lo que debe a cada gestor, filtra por estado y gestor, y marca el pago
 * COMPLETO de una comisión (S9). Los totales se leen por moneda; no se convierte ninguna.
 */
export default function OwnerCommissionsPage() {
  const intl = useIntl();

  const [commissions, setCommissions] = useState<OwnerSalesCommission[]>([]);
  const [managers, setManagers] = useState<SalesManagerOption[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [managerFilter, setManagerFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    ownerCommissionsHttpService
      .getManagers()
      .then((result) => {
        if (active) setManagers(result.data ?? []);
      })
      .catch(() => {
        // El filtro es opcional: si falla, se listan las comisiones igual.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(false);

    ownerCommissionsHttpService
      .list({
        status: statusFilter === 'all' ? undefined : statusFilter,
        salesManagerId: managerFilter || undefined,
      })
      .then((result) => {
        if (!active) return;
        setCommissions(result.data ?? []);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [managerFilter, reloadToken, statusFilter]);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  const pay = async (commission: OwnerSalesCommission) => {
    const confirmed = await confirmDialog({
      title: intl.formatMessage({ id: 'OWNER_COMMISSIONS.PAY_CONFIRM_TITLE' }),
      message: intl.formatMessage(
        { id: 'OWNER_COMMISSIONS.PAY_CONFIRM_TEXT' },
        {
          manager: commission.salesManagerName,
          amount: `${formatCurrency(commission.amount)} ${Currency[commission.currency]}`,
        },
      ),
      confirmButtonText: intl.formatMessage({ id: 'OWNER_COMMISSIONS.PAY' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.CANCEL' }),
    });
    if (!confirmed) return;

    setPayingId(commission.id);
    try {
      const result = await ownerCommissionsHttpService.pay(commission.id);
      if (!result.succeeded) throw new Error('pay rejected');
      showToastSuccess(intl.formatMessage({ id: 'OWNER_COMMISSIONS.PAID_OK' }));
      reload();
    } catch {
      showBlockingError(
        intl.formatMessage({ id: 'OWNER_COMMISSIONS.TITLE' }),
        intl.formatMessage({ id: 'OWNER_COMMISSIONS.PAY_ERROR' }),
      );
    } finally {
      setPayingId(null);
    }
  };

  const formatDate = (value: string) => intl.formatDate(new Date(value), { dateStyle: 'short' });

  return (
    <div className="space-y-4">
      <Card padding="tight" title={intl.formatMessage({ id: 'OWNER_COMMISSIONS.TITLE' })}>
        <p className="text-sm text-text-muted">
          {intl.formatMessage({ id: 'OWNER_COMMISSIONS.SUBTITLE' })}
        </p>
      </Card>

      <Card padding="tight">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text" htmlFor="commission-status">
              {intl.formatMessage({ id: 'OWNER_COMMISSIONS.STATUS_FILTER' })}
            </label>
            <select
              id="commission-status"
              className={INPUT_CLASSES}
              value={statusFilter === 'all' ? 'all' : String(statusFilter)}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value === 'all'
                    ? 'all'
                    : (Number(event.target.value) as SalesCommissionStatus),
                )
              }
            >
              <option value="all">{intl.formatMessage({ id: 'OWNER_COMMISSIONS.ALL' })}</option>
              <option value={String(SalesCommissionStatus.Pending)}>
                {intl.formatMessage({ id: 'OWNER_COMMISSIONS.PENDING' })}
              </option>
              <option value={String(SalesCommissionStatus.Paid)}>
                {intl.formatMessage({ id: 'OWNER_COMMISSIONS.PAID' })}
              </option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text" htmlFor="commission-manager">
              {intl.formatMessage({ id: 'OWNER_COMMISSIONS.MANAGER_FILTER' })}
            </label>
            <select
              id="commission-manager"
              className={INPUT_CLASSES}
              value={managerFilter}
              onChange={(event) => setManagerFilter(event.target.value)}
            >
              <option value="">{intl.formatMessage({ id: 'OWNER_COMMISSIONS.ALL_MANAGERS' })}</option>
              {managers.map((manager) => (
                <option key={manager.id} value={manager.id}>
                  {manager.fullName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {isLoading && <Spinner label={intl.formatMessage({ id: 'GENERAL.LOADING' })} />}

      {!isLoading && error && (
        <InfoBox variant="danger" className="text-center">
          <span data-testid="owner-commissions-error">
            {intl.formatMessage({ id: 'OWNER_COMMISSIONS.LOAD_ERROR' })}
          </span>
        </InfoBox>
      )}

      {!isLoading && !error && commissions.length === 0 && (
        <InfoBox className="text-center">
          {intl.formatMessage({ id: 'OWNER_COMMISSIONS.EMPTY' })}
        </InfoBox>
      )}

      {!isLoading && !error && commissions.length > 0 && (
        <Card padding="tight">
          <div className="overflow-x-auto" data-testid="owner-commissions">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-text-muted">
                <tr>
                  <th className="py-2 pr-3">{intl.formatMessage({ id: 'OWNER_COMMISSIONS.DATE' })}</th>
                  <th className="py-2 pr-3">{intl.formatMessage({ id: 'OWNER_COMMISSIONS.MANAGER' })}</th>
                  <th className="py-2 pr-3">{intl.formatMessage({ id: 'OWNER_COMMISSIONS.ORDER' })}</th>
                  <th className="py-2 pr-3">{intl.formatMessage({ id: 'OWNER_COMMISSIONS.PRODUCT' })}</th>
                  <th className="py-2 pr-3">{intl.formatMessage({ id: 'OWNER_COMMISSIONS.STORE' })}</th>
                  <th className="py-2 pr-3">{intl.formatMessage({ id: 'OWNER_COMMISSIONS.STATUS' })}</th>
                  <th className="py-2 pr-3 text-right">{intl.formatMessage({ id: 'OWNER_COMMISSIONS.AMOUNT' })}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {commissions.map((commission) => (
                  <tr key={commission.id} className="border-t border-border">
                    <td className="py-2 pr-3">{formatDate(commission.orderDate)}</td>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-text">{commission.salesManagerName}</div>
                      <div className="text-xs text-text-muted">{commission.salesManagerLogin}</div>
                    </td>
                    <td className="py-2 pr-3">{commission.orderCode ?? '—'}</td>
                    <td className="py-2 pr-3">
                      {commission.productName} × {commission.quantity}
                    </td>
                    <td className="py-2 pr-3">{commission.storeName}</td>
                    <td className="py-2 pr-3">
                      {commission.status === SalesCommissionStatus.Paid
                        ? intl.formatMessage({ id: 'OWNER_COMMISSIONS.PAID' })
                        : intl.formatMessage({ id: 'OWNER_COMMISSIONS.PENDING' })}
                    </td>
                    <td className="py-2 pr-3 text-right font-medium">
                      {formatCurrency(commission.amount)} {Currency[commission.currency]}
                    </td>
                    <td className="py-2 text-right">
                      {commission.status === SalesCommissionStatus.Pending && (
                        <Button
                          variant="outline"
                          onClick={() => void pay(commission)}
                          disabled={payingId === commission.id}
                          data-testid={`owner-commission-pay-${commission.id}`}
                        >
                          {intl.formatMessage({ id: 'OWNER_COMMISSIONS.PAY' })}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
