import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * [FC-C1] Charts lazy wrappers — sales-chart.tsx, profit-chart.tsx,
 * sparkline.tsx, donut-chart.tsx — Vitest
 * docs/testing/frontend-coverage/FC-C1.md
 *
 * Tests the React.lazy wrappers that load chart-core.tsx asynchronously.
 * Uses waitFor because React.lazy imports are async.
 */

// Mock the lazy-loaded chart-core module
vi.mock('../chart-core', () => ({
  SalesChartCore: ({ data, emptyMessage }: { data: unknown[]; emptyMessage: string }) => (
    <div data-testid="sales-chart-core">
      {data.length === 0 ? emptyMessage : `Sales: ${data.length} points`}
    </div>
  ),
  ProfitChartCore: ({ data, emptyMessage }: { data: unknown[]; emptyMessage: string }) => (
    <div data-testid="profit-chart-core">
      {data.length === 0 ? emptyMessage : `Profit: ${data.length} points`}
    </div>
  ),
  SparklineCore: ({ values }: { values: number[] }) => (
    <div data-testid="sparkline-core">Sparkline: {values.length} values</div>
  ),
  DonutChartCore: ({ slices, emptyMessage }: { slices: unknown[]; emptyMessage: string }) => (
    <div data-testid="donut-chart-core">
      {slices.length === 0 ? emptyMessage : `Donut: ${slices.length} slices`}
    </div>
  ),
}));

import { SalesChart } from '../sales-chart';
import { ProfitChart } from '../profit-chart';
import { KpiSparkline } from '../sparkline';
import { DonutChart } from '../donut-chart';

const sampleData = [
  { label: 'Lun', value: 100 },
  { label: 'Mar', value: 200 },
];
const formatValue = (value: number): string => `${value} CUP`;

describe('sales-chart.tsx — SalesChart', () => {
  it('renders with data', async () => {
    render(
      <SalesChart
        data={sampleData}
        loadingMessage="Cargando..."
        emptyMessage="Sin datos"
        formatValue={formatValue}
        seriesName="Ventas"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('sales-chart-core')).toBeTruthy();
    });
    expect(screen.getByText('Sales: 2 points')).toBeTruthy();
  });

  it('renders empty message when no data', async () => {
    render(
      <SalesChart
        data={[]}
        loadingMessage="Cargando..."
        emptyMessage="Sin datos"
        formatValue={formatValue}
        seriesName="Ventas"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Sin datos')).toBeTruthy();
    });
  });
});

describe('profit-chart.tsx — ProfitChart', () => {
  it('renders with data', async () => {
    render(
      <ProfitChart
        data={sampleData}
        loadingMessage="Cargando..."
        emptyMessage="Sin datos"
        formatValue={formatValue}
        seriesName="Ganancia bruta"
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('profit-chart-core')).toBeTruthy();
    });
    expect(screen.getByText('Profit: 2 points')).toBeTruthy();
  });

  it('renders empty message when no data', async () => {
    render(
      <ProfitChart
        data={[]}
        loadingMessage="Cargando..."
        emptyMessage="Sin datos"
        formatValue={formatValue}
        seriesName="Ganancia bruta"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Sin datos')).toBeTruthy();
    });
  });
});

describe('sparkline.tsx — KpiSparkline', () => {
  it('renders nothing without values (card without sparkline)', () => {
    const { container } = render(<KpiSparkline values={[]} testId="sparkline" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the mini line with values', async () => {
    render(<KpiSparkline values={[1, 2, 3]} testId="sparkline" />);
    await waitFor(() => {
      expect(screen.getByTestId('sparkline-core')).toBeTruthy();
    });
    expect(screen.getByText('Sparkline: 3 values')).toBeTruthy();
  });
});

describe('donut-chart.tsx — DonutChart', () => {
  it('renders slices', async () => {
    render(
      <DonutChart
        slices={[{ id: '1', name: 'Efectivo', value: 10 }]}
        loadingMessage="Cargando..."
        emptyMessage="Sin datos"
        formatValue={formatValue}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('donut-chart-core')).toBeTruthy();
    });
    expect(screen.getByText('Donut: 1 slices')).toBeTruthy();
  });

  it('renders the empty message without slices', async () => {
    render(
      <DonutChart
        slices={[]}
        loadingMessage="Cargando..."
        emptyMessage="Sin datos"
        formatValue={formatValue}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('Sin datos')).toBeTruthy();
    });
  });
});
