import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * [FC-C1] Charts de estadísticas — chart-core.tsx — Vitest
 * docs/testing/frontend-coverage/FC-C1.md
 *
 * Tests SalesChartCore and ProfitChartCore with recharts mocked
 * to avoid JSDOM canvas limitations.
 */

// Mock recharts — JSDOM doesn't support canvas/SVG rendering.
// XAxis renders the tickFormatter output for two sample dates so the
// internal formatLabel can be asserted; the dates come from `xAxisSamples`
// (set per test via the hoisted store below).
const { xAxisSamples } = vi.hoisted(() => ({
  xAxisSamples: {
    first: new Date(2026, 6, 3),
    second: new Date(2026, 2, 15),
  },
}));

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
  XAxis: ({
    dataKey,
    tickFormatter,
  }: {
    dataKey?: string;
    tickFormatter?: (label: Date) => string;
  }) =>
    dataKey === 'label' && tickFormatter ? (
      <span data-testid="x-axis-ticks">
        {`${tickFormatter(xAxisSamples.first)}|${tickFormatter(xAxisSamples.second)}`}
      </span>
    ) : null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  CartesianGrid: () => null,
}));

// Mock the lazy import resolution
vi.mock('~/sales/lib/services/order-offline-service', () => ({
  // Not actually needed for chart-core tests, but prevents import errors
}));

import { SalesChartCore, ProfitChartCore } from '../chart-core';
import type { ChartData } from '~/sales/lib/services/order-offline-service';

describe('chart-core.tsx — SalesChartCore', () => {
  const sampleData: ChartData[] = [
    { label: new Date('2026-01-01'), value: 100 },
    { label: new Date('2026-01-02'), value: 200 },
  ];

  it('renders a LineChart when data has non-zero values', () => {
    render(<SalesChartCore data={sampleData} emptyMessage="Sin datos" />);
    expect(screen.getByTestId('line-chart')).toBeTruthy();
    expect(screen.getByTestId('responsive-container')).toBeTruthy();
  });

  it('renders empty message when all values are zero', () => {
    const zeroData: ChartData[] = [
      { label: new Date('2026-01-01'), value: 0 },
      { label: new Date('2026-01-02'), value: 0 },
    ];
    render(<SalesChartCore data={zeroData} emptyMessage="Sin datos" />);
    expect(screen.getByText('Sin datos')).toBeTruthy();
    expect(screen.queryByTestId('line-chart')).toBeNull();
  });

  it('renders empty message for empty data array', () => {
    render(<SalesChartCore data={[]} emptyMessage="Sin datos" />);
    expect(screen.getByText('Sin datos')).toBeTruthy();
  });
});

describe('chart-core.tsx — ProfitChartCore', () => {
  const sampleData: ChartData[] = [
    { label: new Date('2026-01-01'), value: 50 },
    { label: new Date('2026-01-02'), value: 150 },
  ];

  it('renders a BarChart when data has non-zero values', () => {
    render(<ProfitChartCore data={sampleData} emptyMessage="Sin datos" />);
    expect(screen.getByTestId('bar-chart')).toBeTruthy();
    expect(screen.getByTestId('responsive-container')).toBeTruthy();
  });

  it('renders empty message when all values are zero', () => {
    const zeroData: ChartData[] = [
      { label: new Date('2026-01-01'), value: 0 },
    ];
    render(<ProfitChartCore data={zeroData} emptyMessage="Sin datos" />);
    expect(screen.getByText('Sin datos')).toBeTruthy();
    expect(screen.queryByTestId('bar-chart')).toBeNull();
  });
});

describe('chart-core.tsx — formatLabel', () => {
  it('formats dates as d-MMM in Spanish without leading zero (3-Jul, not 03-Jul)', () => {
    const data: ChartData[] = [
      { label: new Date(2026, 6, 3), value: 42 },
    ];
    const { container, unmount } = render(
      <SalesChartCore data={data} emptyMessage="Sin datos" />,
    );
    // formatLabel is internal — verified through the XAxis tickFormatter mock.
    // 2026-07-03 -> "3-Jul" (day 3, no leading zero; abbreviated Spanish month).
    expect(container.querySelector('[data-testid="x-axis-ticks"]')?.textContent).toBe(
      '3-Jul|15-Mar',
    );
    unmount();
  });

  it('formats ProfitChartCore ticks identically', () => {
    xAxisSamples.first = new Date(2026, 0, 31);
    const data: ChartData[] = [
      { label: new Date(2026, 0, 31), value: 42 },
    ];
    const { container, unmount } = render(
      <ProfitChartCore data={data} emptyMessage="Sin datos" />,
    );
    expect(container.querySelector('[data-testid="x-axis-ticks"]')?.textContent).toBe(
      '31-Ene|15-Mar',
    );
    unmount();
    xAxisSamples.first = new Date(2026, 6, 3);
  });
});
