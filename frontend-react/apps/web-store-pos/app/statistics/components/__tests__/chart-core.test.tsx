import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * [FC-C1] Charts de estadísticas — chart-core.tsx — Vitest
 * docs/testing/frontend-coverage/FC-C1.md
 *
 * Tests the range chart cores (dashboard), the KPI sparkline and the donut with
 * recharts mocked to avoid JSDOM canvas limitations. StoreUsageChartCore keeps
 * its own suite (admin dashboard, string labels, no tickFormatter).
 */

// Payload the mocked <Bar> onClick fires with — mutable so tests can exercise
// the clicked bar's owner list (empty vs populated).
const { barOnClickPayload } = vi.hoisted(() => ({
  barOnClickPayload: { label: 'Lun', value: 3, owners: ['Ana', 'Beto'] },
}));

vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  Line: () => null,
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: ({ onClick }: { onClick?: (...args: unknown[]) => void }) => (
    <button
      type="button"
      data-testid="bar"
      onClick={() => onClick?.({ payload: barOnClickPayload })}
    >
      bar
    </button>
  ),
  PieChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ children }: { children: React.ReactNode }) => <div data-testid="pie">{children}</div>,
  Cell: () => null,
  XAxis: ({
    dataKey,
    tickFormatter,
  }: {
    dataKey?: string;
    tickFormatter?: (label: Date) => string;
  }) => (dataKey === 'label' && tickFormatter ? <span data-testid="x-axis-ticks" /> : null),
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  CartesianGrid: () => null,
}));

import {
  SalesChartCore,
  ProfitChartCore,
  SparklineCore,
  DonutChartCore,
  StoreUsageChartCore,
} from '../chart-core';

const formatValue = (value: number): string => `${value} CUP`;

describe('chart-core.tsx — range SalesChartCore / ProfitChartCore', () => {
  const sampleData = [
    { label: 'Lun', value: 100 },
    { label: 'Mar', value: 200 },
  ];

  it('renders a LineChart when data has non-zero values', () => {
    render(
      <SalesChartCore
        data={sampleData}
        emptyMessage="Sin datos"
        formatValue={formatValue}
        seriesName="Ventas"
      />,
    );
    expect(screen.getByTestId('line-chart')).toBeTruthy();
    expect(screen.getByTestId('responsive-container')).toBeTruthy();
  });

  it('renders empty message when all values are zero', () => {
    render(
      <SalesChartCore
        data={[
          { label: 'Lun', value: 0 },
          { label: 'Mar', value: 0 },
        ]}
        emptyMessage="Sin datos"
        formatValue={formatValue}
        seriesName="Ventas"
      />,
    );
    expect(screen.getByText('Sin datos')).toBeTruthy();
    expect(screen.queryByTestId('line-chart')).toBeNull();
  });

  it('renders empty message for an empty data array', () => {
    render(
      <SalesChartCore
        data={[]}
        emptyMessage="Sin datos"
        formatValue={formatValue}
        seriesName="Ventas"
      />,
    );
    expect(screen.getByText('Sin datos')).toBeTruthy();
  });

  it('renders a BarChart when profit data has non-zero values', () => {
    render(
      <ProfitChartCore
        data={sampleData}
        emptyMessage="Sin datos"
        formatValue={formatValue}
        seriesName="Ganancia bruta"
      />,
    );
    expect(screen.getByTestId('bar-chart')).toBeTruthy();
  });

  it('renders empty message when profit data is all zero', () => {
    render(
      <ProfitChartCore
        data={[{ label: 'Lun', value: 0 }]}
        emptyMessage="Sin datos"
        formatValue={formatValue}
        seriesName="Ganancia bruta"
      />,
    );
    expect(screen.getByText('Sin datos')).toBeTruthy();
    expect(screen.queryByTestId('bar-chart')).toBeNull();
  });

  it('passes pre-formatted string labels through untouched (no tickFormatter)', () => {
    const { container } = render(
      <SalesChartCore
        data={sampleData}
        emptyMessage="Sin datos"
        formatValue={formatValue}
        seriesName="Ventas"
      />,
    );
    expect(container.querySelector('[data-testid="x-axis-ticks"]')).toBeNull();
  });
});

describe('chart-core.tsx — SparklineCore', () => {
  it('renders a mini line without axes for the KPI values', () => {
    render(<SparklineCore values={[1, 2, 3]} testId="sparkline" />);
    expect(screen.getByTestId('sparkline')).toBeTruthy();
    expect(screen.getByTestId('line-chart')).toBeTruthy();
  });

  it('renders an empty mini line when there are no values to plot', () => {
    render(<SparklineCore values={[]} testId="sparkline-empty" />);
    expect(screen.getByTestId('sparkline-empty')).toBeTruthy();
  });
});

describe('chart-core.tsx — DonutChartCore', () => {
  const slices = [
    { id: '1', name: 'Efectivo', value: 75 },
    { id: '2', name: 'Tarjeta', value: 25 },
  ];

  it('renders the donut and its percentage legend', () => {
    render(
      <DonutChartCore
        slices={slices}
        emptyMessage="Sin datos"
        formatValue={formatValue}
        testId="donut"
      />,
    );
    expect(screen.getByTestId('donut')).toBeTruthy();
    expect(screen.getByTestId('pie-chart')).toBeTruthy();
    expect(screen.getByText('Efectivo')).toBeTruthy();
    expect(screen.getByText('75 CUP (75%)')).toBeTruthy();
    expect(screen.getByText('25 CUP (25%)')).toBeTruthy();
  });

  it('renders the empty message when there are no slices', () => {
    render(<DonutChartCore slices={[]} emptyMessage="Sin datos" formatValue={formatValue} />);
    expect(screen.getByText('Sin datos')).toBeTruthy();
    expect(screen.queryByTestId('pie-chart')).toBeNull();
  });

  it('renders the empty message when every slice is zero', () => {
    render(
      <DonutChartCore
        slices={[{ id: '1', name: 'Efectivo', value: 0 }]}
        emptyMessage="Sin datos"
        formatValue={formatValue}
      />,
    );
    expect(screen.getByText('Sin datos')).toBeTruthy();
  });
});

describe('chart-core.tsx — StoreUsageChartCore (admin dashboard)', () => {
  // String labels, NOT Dates — the admin dashboard sends pre-formatted day
  // names ('Lun'…'Dom' / '1'…'30'), so no tickFormatter may run on them.
  const sampleData: { label: string; value: number; owners: string[] }[] = [
    { label: 'Lun', value: 3, owners: ['Ana', 'Beto'] },
    { label: 'Mar', value: 5, owners: ['Carlos'] },
  ];

  it('renders a BarChart when data has non-zero values', () => {
    render(<StoreUsageChartCore data={sampleData} emptyMessage="Sin datos" />);
    expect(screen.getByTestId('bar-chart')).toBeTruthy();
    expect(screen.getByTestId('responsive-container')).toBeTruthy();
  });

  it('renders empty message when all values are zero', () => {
    const zeroData: { label: string; value: number; owners: string[] }[] = [
      { label: 'Lun', value: 0, owners: [] },
      { label: 'Mar', value: 0, owners: [] },
    ];
    render(<StoreUsageChartCore data={zeroData} emptyMessage="Sin datos" />);
    expect(screen.getByText('Sin datos')).toBeTruthy();
    expect(screen.queryByTestId('bar-chart')).toBeNull();
  });

  it('renders empty message when data is empty', () => {
    render(<StoreUsageChartCore data={[]} emptyMessage="Sin datos" />);
    expect(screen.getByText('Sin datos')).toBeTruthy();
    expect(screen.queryByTestId('bar-chart')).toBeNull();
  });

  it('uses NO tickFormatter — string labels pass through untouched', () => {
    // The XAxis mock only renders the x-axis-ticks span when a tickFormatter
    // is present; for StoreUsageChartCore the span must NOT exist.
    const { container } = render(
      <StoreUsageChartCore data={sampleData} emptyMessage="Sin datos" />,
    );
    expect(container.querySelector('[data-testid="x-axis-ticks"]')).toBeNull();
  });

  it('shows owner names joined by | below the chart when a bar is clicked', () => {
    render(<StoreUsageChartCore data={sampleData} emptyMessage="Sin datos" />);
    // The recharts Bar mock fires the onClick handler with the bar's payload.
    fireEvent.click(screen.getByTestId('bar'));
    expect(screen.getByTestId('store-usage-selected')).toHaveTextContent('Lun: Ana | Beto');
  });

  it('shows the noOwnersMessage for a clicked bar without owners', () => {
    barOnClickPayload.owners = [];
    render(
      <StoreUsageChartCore
        data={sampleData}
        emptyMessage="Sin datos"
        noOwnersMessage="Sin tiendas"
      />,
    );
    fireEvent.click(screen.getByTestId('bar'));
    expect(screen.getByTestId('store-usage-selected')).toHaveTextContent('Lun: Sin tiendas');
  });
});
