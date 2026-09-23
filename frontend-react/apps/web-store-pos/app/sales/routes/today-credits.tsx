import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit, PaymentType } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { SaleCreditOfflineService } from '../lib/services/sale-credit-offline-service';
import { SaleCreditList } from '../components/sale-credit-list';
import { formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';

export const clientLoader = featureLoader([EFeatures.CreditSale]);

/**
 * Matches Angular's `today-sale-credits.component.html` (Créditos del día):
 * no filters, flat (not grouped) list of today's active credits, rendered
 * with `[readOnly]="false"` (edit/pay actions reachable via the settings
 * menu inside `SaleCreditList`).
 */
export function TodaySaleCreditsPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [saleCredits, setSaleCredits] = useState<SaleCredit[]>([]);

  // WU4 (flagged mismatch #2): Angular's real call pattern
  // (today-sale-credits.component.ts:27) is `getSaleCreditsInDayObservable(new Date())`.
  async function loadSaleCredits() {
    const service = new SaleCreditOfflineService(storeId);
    const response = await service.getSaleCreditsInDayObservable(new Date());
    // SaleCreditOfflineService.getSaleCreditsInDayObservable is a same-tick
    // `Promise.resolve(...)` over local storage — it never actually fails; this guard
    // exists for the type only.
    if (!response.succeeded) return;
    setSaleCredits(response.data);
  }

  useEffect(() => {
    void loadSaleCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadSaleCredits reads only storeId
  }, [storeId]);

  // WU2 (flagged mismatch #5): updateSaleCredit/paidSaleCredit return a SYNC DataResult
  // that never throws — replaces the try/catch translation with a `.succeeded` check.
  function handleSave(creditId: string, client: string, note: string): boolean {
    const service = new SaleCreditOfflineService(storeId);
    const result = service.updateSaleCredit(creditId, client, note);
    if (!result.succeeded) return false;
    void loadSaleCredits();
    return true;
  }

  function handlePay(creditId: string, paidType: PaymentType, note: string): boolean {
    const service = new SaleCreditOfflineService(storeId);
    const result = service.paidSaleCredit(creditId, paidType, note);
    if (!result.succeeded) return false;
    void loadSaleCredits();
    return true;
  }

  return (
    <Card
      padding="tight"
      title={
        <TodayCreditsCardTitle
          count={saleCredits.length}
          total={saleCredits.reduce((t, c) => t + (c.isPaid ? 0 : c.total), 0)}
        />
      }
    >
      {saleCredits.length === 0 && (
        <InfoBox variant="primary" className="mb-6 text-center">
          {/* SALE_CREDIT.NO_SALE_CREDIT_FOUND_IN_DAY */}
          {intl.formatMessage({ id: 'SALE_CREDIT.NO_SALE_CREDIT_FOUND_IN_DAY' })}
        </InfoBox>
      )}

      <SaleCreditList
        saleCredits={saleCredits}
        readOnly={false}
        onSave={handleSave}
        onPay={handlePay}
      />
    </Card>
  );
}

export default TodaySaleCreditsPage;

/**
 * Header pedido por el usuario: «Créditos del día (n)» a la izquierda — n = TODOS los
 * créditos del día (pagados o no) — y el valor total a la derecha. El total suma SOLO
 * los créditos por pagar (`!isPaid`); se pinta en `text-warning` (ámbar) cuando es > 0
 * y en `text-success` (verde) cuando es 0. El texto base se mantiene como «Créditos del
 * día» (SALE_CREDIT.TODAY_CREDITS): renombrarlo rompería los E2E protegidos
 * pay-credit/create-credit.
 */
function TodayCreditsCardTitle({ count, total }: { count: number; total: number }) {
  const intl = useIntl();
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        {/* SALE_CREDIT.TODAY_CREDITS */}
        {intl.formatMessage({ id: 'SALE_CREDIT.TODAY_CREDITS' })}
        <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
          ({count})
        </span>
      </span>
      <span
        className={`text-sm font-semibold whitespace-nowrap ${total === 0 ? 'text-success' : 'text-warning'}`}
      >
        {formatMoneyWithCurrency(total)}
      </span>
    </div>
  );
}
