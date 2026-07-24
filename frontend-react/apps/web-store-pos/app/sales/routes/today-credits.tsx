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
    setSaleCredits(response.data);
  }

  useEffect(() => {
    void loadSaleCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // SALE_CREDIT.TODAY_CREDITS
        intl.formatMessage({ id: 'SALE_CREDIT.TODAY_CREDITS' })
      }
    >
      {saleCredits.length === 0 && (
        <InfoBox variant="primary" className="mb-6 text-center">
          {/* SALE_CREDIT.NO_SALE_CREDIT_FOUND_IN_DAY */}
          {intl.formatMessage({ id: 'SALE_CREDIT.NO_SALE_CREDIT_FOUND_IN_DAY' })}
        </InfoBox>
      )}

      <SaleCreditList saleCredits={saleCredits} readOnly={false} onSave={handleSave} onPay={handlePay} />
    </Card>
  );
}

export default TodaySaleCreditsPage;
