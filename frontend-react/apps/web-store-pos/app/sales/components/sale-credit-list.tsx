import { useIntl } from 'react-intl';
import type { SaleCredit } from '@store-mgmt/domain';

interface SaleCreditListProps {
  credits: SaleCredit[];
  onCreditClick: (credit: SaleCredit) => void;
}

export function SaleCreditList({ credits, onCreditClick }: SaleCreditListProps) {
  const intl = useIntl();

  if (credits.length === 0) {
    return (
      <div className="py-8 text-center text-gray-400">
        {intl.formatMessage({ id: 'CREDITS.EMPTY_STATE' })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {credits.map((credit) => {
        const remaining = credit.total - credit.paid;
        return (
          <button
            key={credit.id}
            onClick={() => onCreditClick(credit)}
            className="w-full rounded border p-3 text-left hover:bg-gray-50 focus:outline-none"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-gray-800">{credit.client}</p>
                <p className="text-xs text-gray-500">
                  {intl.formatMessage({ id: 'CREDITS.DATE' })}:{' '}
                  {new Date(credit.date).toLocaleDateString('es')}
                </p>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-2">
                  {credit.isPaid ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                      {intl.formatMessage({ id: 'CREDITS.STATUS.PAID' })}
                    </span>
                  ) : (
                    <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                      {intl.formatMessage({ id: 'CREDITS.STATUS.UNPAID' })}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-600">
                  {intl.formatMessage({ id: 'CREDITS.REMAINING' })}: ${remaining.toFixed(2)}
                </p>
                <p className="text-xs text-gray-400">
                  {intl.formatMessage({ id: 'CREDITS.TOTAL' })}: ${credit.total.toFixed(2)}
                </p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
