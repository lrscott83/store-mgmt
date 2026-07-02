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

  function loadSaleCredits() {
    const service = new SaleCreditOfflineService(storeId);
    setSaleCredits(service.getActiveToday());
  }

  useEffect(() => {
    loadSaleCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Angular's SaleCreditOfflineService.updateSaleCredit/paidSaleCredit return a DataResult
  // that can report `succeeded: false`; React's offline-service ports only fail via a
  // not-found exception. try/catch is the faithful translation of that failure signal for
  // the Swal error dialogs in EditSaleCreditModal/SaleCreditPaymentModal.
  function handleSave(creditId: string, client: string, note: string): boolean {
    try {
      const service = new SaleCreditOfflineService(storeId);
      service.update(creditId, client, note);
      loadSaleCredits();
      return true;
    } catch {
      return false;
    }
  }

  function handlePay(creditId: string, paidType: PaymentType, note: string): boolean {
    try {
      const service = new SaleCreditOfflineService(storeId);
      service.pay(creditId, paidType, note);
      loadSaleCredits();
      return true;
    } catch {
      return false;
    }
  }

  return (
    <Card
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
