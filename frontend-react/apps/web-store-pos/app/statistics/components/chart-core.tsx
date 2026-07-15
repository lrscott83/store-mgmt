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

/** Formats a chart-point `label` Date as MM-DD for axis ticks / tooltip labels. */
function formatLabel(label: Date): string {
  const month = String(label.getMonth() + 1).padStart(2, '0');
  const day = String(label.getDate()).padStart(2, '0');
  return `${month}-${day}`;
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
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v}`} />
        <Tooltip
          formatter={(value: number) => [`$${value.toFixed(2)}`, 'Ingresos']}
          labelFormatter={(label: Date) => formatLabel(label)}
        />
        <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} name="value" />
      </LineChart>
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
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v}`} />
        <Tooltip
          formatter={(value: number) => [`$${(value as number).toFixed(2)}`, 'Ganancia bruta']}
          labelFormatter={(label: Date) => formatLabel(label)}
        />
        <Bar dataKey="value" fill="#16a34a" name="value" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
