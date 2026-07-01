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

export const clientLoader = featureLoader([EFeatures.CreditSale]);

type CreditFilter = 'all' | 'paid' | 'unpaid';

function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  };
}

export function SaleCreditsPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  const [range, setRange] = useState(defaultDateRange());
  const [filter, setFilter] = useState<CreditFilter>('all');
  const [credits, setCredits] = useState<SaleCredit[]>([]);
  const [selectedCredit, setSelectedCredit] = useState<SaleCredit | null>(null);
  const [paymentCredit, setPaymentCredit] = useState<SaleCredit | null>(null);

  function loadCredits() {
    const service = new SaleCreditOfflineService(storeId);
    const from = new Date(range.from);
    const to = new Date(range.to);
    to.setHours(23, 59, 59, 999);
    setCredits(service.getByDateRange(from, to));
  }

  useEffect(() => {
    loadCredits();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, range.from, range.to]);

  const filteredCredits =
    filter === 'all'
      ? credits
      : filter === 'paid'
        ? credits.filter((c) => c.isPaid)
        : credits.filter((c) => !c.isPaid);

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
      <h1 className="text-xl font-semibold">{intl.formatMessage({ id: 'CREDITS.TITLE' })}</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-1">
          {(['all', 'paid', 'unpaid'] as CreditFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {intl.formatMessage({
                id: f === 'all'
                  ? 'CREDITS.FILTER.ALL'
                  : f === 'paid'
                    ? 'CREDITS.FILTER.PAID'
                    : 'CREDITS.FILTER.UNPAID',
              })}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="rounded border px-2 py-1 text-sm"
          />
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="rounded border px-2 py-1 text-sm"
          />
        </div>
      </div>

      <SaleCreditList credits={filteredCredits} onCreditClick={setSelectedCredit} />

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

export default SaleCreditsPage;
