import { HelpIcon } from '~/shared/components/ui/icons';
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
  /** Values driving the trend glyph/color (selected currency). */
  actual: number;
  previous: number;
  sparklineValues: number[];
  sparklineColor?: string;
  testId: string;
  /** Opens the merged breakdown popup — triggered ONLY by the (i) icon now. */
  onOpenDetail: () => void;
  onOpenTrend: () => void;
}

/**
 * One dashboard KPI card: title with a right-aligned `(i)` info button, the
 * value (plain text, non-interactive), the KPI sparkline and the underlined
 * "vs anterior" trend (tap → comparison popup).
 *
 * The `(i)` is the ONLY trigger for the merged breakdown popup (owner's
 * correction 2026-09-26: "solo quiero que el (i) abra esa vista"); the value no
 * longer opens anything. There is no `InfoIcon` in
 * `~/shared/components/ui/icons`; `HelpIcon` is the circle glyph that file
 * offers, so it is reused here as the info affordance.
 */
export function KpiCard({
  title,
  valueText,
  actual,
  previous,
  sparklineValues,
  sparklineColor,
  testId,
  onOpenDetail,
  onOpenTrend,
}: KpiCardProps) {
  return (
    <div className="rounded border bg-white p-4 shadow-sm" data-testid={testId}>
      <div className="flex items-start justify-between gap-2">
        <h5 className="text-sm font-medium text-gray-700">{title}</h5>
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label={`Ver desglose de ${title}`}
          title="Ver desglose por moneda y método de pago"
          data-testid={`${testId}-info`}
          className="shrink-0 rounded-full p-0.5 text-text-muted hover:bg-surface-hover hover:text-text"
        >
          <HelpIcon />
        </button>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <p className="text-2xl font-bold text-gray-900" data-testid={`${testId}-value`}>
          {valueText}
        </p>
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
