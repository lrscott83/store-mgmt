import { useIntl } from 'react-intl';

interface ExpensePaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
}

const LIMIT_OPTIONS = [10, 25, 50, 100];

export function ExpensePagination({ page, limit, total, onPageChange, onLimitChange }: ExpensePaginationProps) {
  const intl = useIntl();
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex items-center justify-between gap-4 rounded border bg-white px-4 py-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-gray-600">
          {intl.formatMessage({ id: 'EXPENSES.PAGINATION.ROWS_PER_PAGE' })}:
        </span>
        <select
          value={limit}
          onChange={(e) => {
            onLimitChange(Number(e.target.value));
            onPageChange(1);
          }}
          className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={intl.formatMessage({ id: 'EXPENSES.PAGINATION.ROWS_PER_PAGE' })}
        >
          {LIMIT_OPTIONS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3 text-gray-600">
        <span>
          {intl.formatMessage(
            { id: 'EXPENSES.PAGINATION.INFO' },
            { page, totalPages, total },
          )}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={!canPrev}
            className="rounded border px-2 py-1 text-sm disabled:opacity-40"
            aria-label={intl.formatMessage({ id: 'EXPENSES.PAGINATION.PREV' })}
          >
            ‹
          </button>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={!canNext}
            className="rounded border px-2 py-1 text-sm disabled:opacity-40"
            aria-label={intl.formatMessage({ id: 'EXPENSES.PAGINATION.NEXT' })}
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
