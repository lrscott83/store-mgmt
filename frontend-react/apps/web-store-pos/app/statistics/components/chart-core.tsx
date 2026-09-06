// IMPORTANT: This is the ONLY file in the project that imports recharts.
// sales-chart.tsx and profit-chart.tsx use React.lazy to load this file,
// keeping recharts out of the main/auth/entry bundle (STAT-8, CC-6).
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import type { ChartData } from '~/sales/lib/services/order-offline-service';
import { formatCurrency } from '~/shared/lib/format-currency';

const MONTHS_ES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
] as const;

/**
 * Formats a chart-point `label` Date as `d-MMM` in Spanish, e.g. `3-Jul`.
 * Day without leading zero (3, not 03); abbreviated month name (Jul).
 */
function formatLabel(label: Date): string {
  const day = label.getDate();
  const month = MONTHS_ES[label.getMonth()];
  return `${day}-${month}`;
}

// ─── Sales Chart (LastMonthSalesComponent — STAT-9) ───────────────────────────

interface SalesChartCoreProps {
  data: ChartData[];
  emptyMessage: string;
}

export function SalesChartCore({ data, emptyMessage }: SalesChartCoreProps) {
  const allZero = data.every((p) => p.value === 0);

  if (allZero) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} tickFormatter={formatLabel} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatCurrency(v)} />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), 'Ingresos']}
          labelFormatter={(label: Date) => formatLabel(label)}
        />
        <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} name="value" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Store Usage Chart (admin dashboard) ─────────────────────────────────────
//
// Days on X, store-usage count on Y. The labels arrive ALREADY FORMATTED
// ('Lun'…'Dom' for the 7-day window, '1'…'30' for the 30-day one) — string
// labels, NOT Dates, so formatLabel must not run on them. A per-day discrete
// count is the same shape as the profit chart, hence BarChart.
//
// Structural prop type, local on purpose: the admin dashboard passes its own
// `{ label: string; value: number }[]` (admin/dashboard/components/
// store-usage-chart.tsx) — cross-feature TYPE imports would invert the
// dependency direction for no gain.

interface StoreUsageChartCoreProps {
  data: { label: string; value: number }[];
  emptyMessage: string;
}

export function StoreUsageChartCore({ data, emptyMessage }: StoreUsageChartCoreProps) {
  const allZero = data.every((p) => p.value === 0);

  if (allZero) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip formatter={(value: number) => [value, 'Tiendas']} />
        <Bar dataKey="value" fill="#0891b2" name="value" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Profit Chart (LastMonthSaleProfitsComponent — STAT-10/11) ────────────────

interface ProfitChartCoreProps {
  data: ChartData[];
  emptyMessage: string;
}

export function ProfitChartCore({ data, emptyMessage }: ProfitChartCoreProps) {
  const allZero = data.every((p) => p.value === 0);

  if (allZero) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} tickFormatter={formatLabel} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => formatCurrency(v)} />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value as number), 'Ganancia bruta']}
          labelFormatter={(label: Date) => formatLabel(label)}
        />
        <Bar dataKey="value" fill="#16a34a" name="value" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
