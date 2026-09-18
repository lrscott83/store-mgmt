import { PlusIcon } from '~/shared/components/ui/icons';
import type { CurrencyTotal } from '~/shared/lib/currency-totals';
import { KpiSparkline } from './sparkline';

/** Trend color of "vs anterior" — 1:1 with the original dashboard's getTrendClass. */
export function getTrendClass(actual: number, previous: number): string {
  if (actual === previous) return 'text-secondary';
  return actual >= previous ? 'text-success' : 'text-danger';
}

/** Trend glyph (▲/▼/–) — the original dashboard's getTrendGlyph, kept verbatim. */
export function getTrendGlyph(actual: number, previous: number): string {
  if (actual === previous) return '–';
  return actual >= previous ? '▲' : '▼';
}

interface KpiCardProps {
  title: string;
  valueText: string;
  /** Ordered per-currency totals — the "+" renders only when there are 2+ currencies. */
  currencyTotals: CurrencyTotal[];
  /** Values driving the trend glyph/color (primary currency). */
  actual: number;
  previous: number;
  sparklineValues: number[];
  sparklineColor?: string;
  testId: string;
  onOpenDetail: () => void;
  onOpenTrend: () => void;
  onOpenCurrencies: () => void;
}

/**
 * One dashboard KPI card: title, primary-currency value (tap → detail popup),
 * a "+" when 2+ currencies are present (tap → per-currency amounts), the KPI
 * sparkline and the underlined "vs anterior" trend (tap → comparison popup).
 */
export function KpiCard({
  title,
  valueText,
  currencyTotals,
  actual,
  previous,
  sparklineValues,
  sparklineColor,
  testId,
  onOpenDetail,
  onOpenTrend,
  onOpenCurrencies,
}: KpiCardProps) {
  return (
    <div className="rounded border bg-white p-4 shadow-sm" data-testid={testId}>
      <h5 className="text-sm font-medium text-gray-700">{title}</h5>
      <div className="mt-1 flex items-baseline gap-1">
        <button
          type="button"
          onClick={onOpenDetail}
          className="text-left"
          data-testid={`${testId}-value`}
        >
          <p className="text-2xl font-bold text-gray-900">{valueText}</p>
        </button>
        {currencyTotals.length > 1 && (
          <button
            type="button"
            onClick={onOpenCurrencies}
            aria-label={title}
            data-testid={`${testId}-currencies`}
            className="rounded-full border border-border px-2 text-sm font-bold text-text-muted hover:bg-surface-hover"
          >
            <PlusIcon className="inline h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <KpiSparkline
        values={sparklineValues}
        stroke={sparklineColor}
        testId={`${testId}-sparkline`}
      />
      <button type="button" onClick={onOpenTrend} className="text-left">
        <small
          className={`text-xs font-bold underline ${getTrendClass(actual, previous)}`}
          data-testid={`${testId}-trend`}
        >
          <span aria-hidden="true">{getTrendGlyph(actual, previous)}</span> vs anterior
        </small>
      </button>
    </div>
  );
}
