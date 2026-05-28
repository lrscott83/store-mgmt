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
import type { DailySalesPoint, DailyProfitPoint } from '../lib/services/statistics-aggregation-service';

// ─── Sales Chart (LastMonthSalesComponent — STAT-9) ───────────────────────────

interface SalesChartCoreProps {
  data: DailySalesPoint[];
  emptyMessage: string;
}

export function SalesChartCore({ data, emptyMessage }: SalesChartCoreProps) {
  const allZero = data.every((p) => p.totalRevenue === 0);

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
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10 }}
          tickFormatter={(v: string) => v.slice(5)} // MM-DD
        />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v}`} />
        <Tooltip
          formatter={(value: number, name: string) => {
            if (name === 'totalRevenue') return [`$${value.toFixed(2)}`, 'Ingresos'];
            if (name === 'orderCount') return [value, 'Pedidos'];
            return [value, name];
          }}
          labelFormatter={(label: string) => label}
        />
        <Line
          type="monotone"
          dataKey="totalRevenue"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
          name="totalRevenue"
        />
        <Line
          type="monotone"
          dataKey="orderCount"
          stroke="#9ca3af"
          strokeWidth={1}
          dot={false}
          name="orderCount"
          yAxisId={0}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Profit Chart (LastMonthSaleProfitsComponent — STAT-10/11) ────────────────

interface ProfitChartCoreProps {
  data: DailyProfitPoint[];
  emptyMessage: string;
}

export function ProfitChartCore({ data, emptyMessage }: ProfitChartCoreProps) {
  const allZero = data.every((p) => p.profit === 0);

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
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10 }}
          tickFormatter={(v: string) => v.slice(5)} // MM-DD
        />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v}`} />
        <Tooltip
          formatter={(value: number) => [`$${(value as number).toFixed(2)}`, 'Ganancia bruta']}
          labelFormatter={(label: string) => label}
        />
        <Bar dataKey="profit" fill="#16a34a" name="profit" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
