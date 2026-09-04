import { useIntl } from 'react-intl';
import { Button } from '~/shared/components/ui/button';
import { CloseIcon } from '~/shared/components/ui/icons';
import { formatLocalDate } from '~/shared/lib/date-utils';
import { formatCurrency } from '~/shared/lib/format-currency';

export interface DaySalesSummary {
  /** Local midnight of the summary's calendar day. */
  date: Date;
  orderCount: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
}

interface DaySalesSummaryModalProps {
  summary: DaySalesSummary;
  onClose: () => void;
}

/**
 * Per-day "Resumen de ventas" popup opened from the sales-history day gear menu
 * (React-only feature — Angular's orders history has no gear menu at all). Renders the
 * same four metrics as reports/today's sales-summary section (REPORTS.SALES_SUMMARY.*),
 * scoped to a single day; the caller computes the summary via
 * `computeDaySalesSummary` (orders.tsx), the same aggregation today-report.tsx uses.
 */
export function DaySalesSummaryModal({ summary, onClose }: DaySalesSummaryModalProps) {
  const intl = useIntl();

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">
            {intl.formatMessage(
              { id: 'SALES.ORDERS.DAY_SALES_SUMMARY_TITLE' },
              { date: formatLocalDate(summary.date) },
            )}
          </h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label={intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Same 4-metric grid as reports/today's sales-summary section. */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded bg-gray-50 p-3 text-center">
            <div className="text-2xl font-bold text-gray-800">{summary.orderCount}</div>
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.ORDER_COUNT' })}
            </div>
          </div>
          <div className="rounded bg-gray-50 p-3 text-center">
            <div className="text-2xl font-bold text-green-700 whitespace-nowrap">
              {formatCurrency(summary.totalRevenue)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.TOTAL_REVENUE' })}
            </div>
          </div>
          <div className="rounded bg-gray-50 p-3 text-center">
            <div className="text-2xl font-bold text-red-600 whitespace-nowrap">{formatCurrency(summary.totalCost)}</div>
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.TOTAL_COST' })}
            </div>
          </div>
          <div className="rounded bg-gray-50 p-3 text-center">
            <div className="text-2xl font-bold text-blue-700 whitespace-nowrap">
              {formatCurrency(summary.totalProfit)}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage({ id: 'REPORTS.SALES_SUMMARY.TOTAL_PROFIT' })}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="fab" onClick={onClose}>
            <CloseIcon />
            {intl.formatMessage({ id: 'GENERAL.CLOSE' })}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DaySalesSummaryModal;
