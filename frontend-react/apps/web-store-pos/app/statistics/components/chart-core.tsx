// IMPORTANT: This is the ONLY file in the project that imports recharts.
// sales-chart.tsx / profit-chart.tsx / sparkline.tsx / donut-chart.tsx use
// React.lazy to load this file, keeping recharts out of the main/auth/entry
// bundle (STAT-8, CC-6).
import { useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

/**
 * One already-labelled chart point. Labels arrive PRE-FORMATTED by the caller
 * (dashboard: `formatBucketLabel` — `Lun`, `8`, `Lun 8 – Dom 14`, `Sep`), so no
 * tickFormatter runs on them (same convention as StoreUsageChartCore below).
 */
export interface ChartSeriesPoint {
  label: string;
  value: number;
}

interface RangeChartProps {
  data: ChartSeriesPoint[];
  emptyMessage: string;
  /** Formats Y-axis ticks and tooltip values (the caller owns the currency rule). */
  formatValue: (value: number) => string;
  /** Tooltip series name (e.g. 'Ventas'). */
  seriesName: string;
}

// ─── Sales Chart (range — dashboard "Ventas") ─────────────────────────────────

export function SalesChartCore({ data, emptyMessage, formatValue, seriesName }: RangeChartProps) {
  const allZero = data.every((point) => point.value === 0);

  if (data.length === 0 || allZero) {
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
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(value: number) => formatValue(value)} />
        <Tooltip
          formatter={(value: number) => [formatValue(value), seriesName]}
          labelFormatter={(label: string) => label}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
          name={seriesName}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Profit Chart (range — dashboard "Ganancias") ─────────────────────────────

export function ProfitChartCore({ data, emptyMessage, formatValue, seriesName }: RangeChartProps) {
  const allZero = data.every((point) => point.value === 0);

  if (data.length === 0 || allZero) {
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
        <YAxis tick={{ fontSize: 10 }} tickFormatter={(value: number) => formatValue(value)} />
        <Tooltip
          formatter={(value: number) => [formatValue(value), seriesName]}
          labelFormatter={(label: string) => label}
        />
        <Bar dataKey="value" fill="#16a34a" name={seriesName} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── KPI sparkline (dashboard cards) ──────────────────────────────────────────

interface SparklineCoreProps {
  values: number[];
  stroke?: string;
  testId?: string;
}

/** Axes-less mini line: the KPI's evolution over the window's buckets. */
export function SparklineCore({ values, stroke = '#0891b2', testId }: SparklineCoreProps) {
  const data = values.map((value, index) => ({ index, value }));

  return (
    <div data-testid={testId} className="h-10 w-full">
      <ResponsiveContainer width="100%" height={40}>
        <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            name="value"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Donut chart (dashboard breakdowns) ───────────────────────────────────────

const DONUT_COLORS = [
  '#0891b2',
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#db2777',
  '#65a30d',
] as const;

interface DonutChartCoreProps {
  slices: { id: string; name: string; value: number }[];
  emptyMessage: string;
  formatValue: (value: number) => string;
  testId?: string;
}

/**
 * Donut with a percentage legend BELOW it (cards, never a wide table): each row
 * shows the slice name, its amount and its share of the total.
 */
export function DonutChartCore({ slices, emptyMessage, formatValue, testId }: DonutChartCoreProps) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (slices.length === 0 || total === 0) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div data-testid={testId}>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="name"
            innerRadius={45}
            outerRadius={80}
            paddingAngle={2}
          >
            {slices.map((slice, index) => (
              <Cell key={slice.id} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => [formatValue(value), '']} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-2 space-y-1">
        {slices.map((slice, index) => (
          <li key={slice.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }}
              />
              <span className="truncate">{slice.name}</span>
            </span>
            <span className="whitespace-nowrap">
              {formatValue(slice.value)} ({Math.round((slice.value / total) * 100)}%)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Store Usage Chart (admin dashboard) ─────────────────────────────────────
//
// Days on X, store-usage count on Y. The labels arrive ALREADY FORMATTED
// ('Lun'…'Dom' for the 7-day window, '1'…'30' for the 30-day one) — string
// labels, NOT Dates, so no tickFormatter may run on them. A per-day discrete
// count is the same shape as the profit chart, hence BarChart.
//
// Each point carries the owners of the stores used that day (the dashboard
// aligns them from the API's ownerNamesPerDay). Hovering a bar shows those
// owners joined by ' | ' instead of the raw count; clicking a bar pins the
// same detail below the chart so it stays visible after the mouse moves away.
//
// Structural prop type, local on purpose: the admin dashboard passes its own
// `{ label: string; value: number; owners: string[] }[]` (admin/dashboard/
// components/store-usage-chart.tsx) — cross-feature TYPE imports would invert
// the dependency direction for no gain.

export interface StoreUsageChartPoint {
  label: string;
  value: number;
  owners: string[];
}

interface StoreUsageChartCoreProps {
  data: StoreUsageChartPoint[];
  emptyMessage: string;
  noOwnersMessage?: string;
}

export function StoreUsageChartCore({
  data,
  emptyMessage,
  noOwnersMessage = '—',
}: StoreUsageChartCoreProps) {
  const [selected, setSelected] = useState<StoreUsageChartPoint | null>(null);
  const allZero = data.every((p) => p.value === 0);

  if (allZero) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-gray-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
          <Tooltip
            formatter={(_value, _name, props) => {
              const point = props?.payload as StoreUsageChartPoint | undefined;
              const owners = point?.owners ?? [];
              return [owners.length > 0 ? owners.join(' | ') : noOwnersMessage, 'Owners'];
            }}
          />
          <Bar
            dataKey="value"
            fill="#0891b2"
            name="value"
            radius={[2, 2, 0, 0]}
            onClick={(entry) => setSelected((entry?.payload as StoreUsageChartPoint) ?? null)}
          />
        </BarChart>
      </ResponsiveContainer>
      {selected && (
        <div className="mt-2 text-sm text-gray-700" data-testid="store-usage-selected">
          <span className="font-medium">{selected.label}: </span>
          <span>{selected.owners.length > 0 ? selected.owners.join(' | ') : noOwnersMessage}</span>
        </div>
      )}
    </div>
  );
}
