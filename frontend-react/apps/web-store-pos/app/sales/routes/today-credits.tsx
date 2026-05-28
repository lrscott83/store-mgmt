import { useState, useEffect } from 'react';
import { useIntl } from 'react-intl';
import type { SaleCredit } from '@store-mgmt/domain';
import { EFeatures, PaymentType } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { SaleCreditOfflineService } from '../lib/services/sale-credit-offline-service';
import { SaleCreditList } from '../components/sale-credit-list';
import { EditSaleCreditModal } from '../components/edit-sale-credit-modal';
import { SaleCreditPaymentModal } from '../components/sale-credit-payment-modal';

export const loader = featureLoader([EFeatures.CreditSale]);

export function TodaySaleCreditsPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [credits, setCredits] = useState<SaleCredit[]>([]);
  const [selectedCredit, setSelectedCredit] = useState<SaleCredit | null>(null);
  const [paymentCredit, setPaymentCredit] = useState<SaleCredit | null>(null);

  function loadCredits() {
    const service = new SaleCreditOfflineService(storeId);
    setCredits(service.getActiveToday());
  }

  useEffect(() => {
    loadCredits();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  function handleSave(creditId: string, client: string, note: string) {
    const service = new SaleCreditOfflineService(storeId);
    service.update(creditId, client, note);
    loadCredits();
    setSelectedCredit(null);
  }

  function handlePayment(credit: SaleCredit) {
    setSelectedCredit(null);
    setPaymentCredit(credit);
  }

  function handlePaymentConfirm(creditId: string, paidType: PaymentType) {
    const service = new SaleCreditOfflineService(storeId);
    service.pay(creditId, paidType, '');
    loadCredits();
    setPaymentCredit(null);
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'CREDITS.TODAY_TITLE' })}
      </h1>

      <SaleCreditList credits={credits} onCreditClick={setSelectedCredit} />

      {selectedCredit && (
        <EditSaleCreditModal
          credit={selectedCredit}
          isOpen={true}
          onClose={() => setSelectedCredit(null)}
          onSave={handleSave}
          onPayment={handlePayment}
        />
      )}

      {paymentCredit && (
        <SaleCreditPaymentModal
          credit={paymentCredit}
          isOpen={true}
          onClose={() => setPaymentCredit(null)}
          onConfirm={handlePaymentConfirm}
        />
      )}
    </div>
  );
}

export default TodaySaleCreditsPage;
