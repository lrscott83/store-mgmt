import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * [FC-C1] Charts lazy wrappers — sales-chart.tsx, profit-chart.tsx — Vitest
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
}));

import { SalesChart } from '../sales-chart';
import { ProfitChart } from '../profit-chart';
import type { ChartData } from '~/sales/lib/services/order-offline-service';

const sampleData: ChartData[] = [
  { label: new Date('2026-01-01'), value: 100 },
  { label: new Date('2026-01-02'), value: 200 },
];

describe('sales-chart.tsx — SalesChart', () => {
  it('renders with data', async () => {
    render(
      <SalesChart data={sampleData} loadingMessage="Cargando..." emptyMessage="Sin datos" />
    );
    await waitFor(() => {
      expect(screen.getByTestId('sales-chart-core')).toBeTruthy();
    });
    expect(screen.getByText('Sales: 2 points')).toBeTruthy();
  });

  it('renders empty message when no data', async () => {
    render(
      <SalesChart data={[]} loadingMessage="Cargando..." emptyMessage="Sin datos" />
    );
    await waitFor(() => {
      expect(screen.getByText('Sin datos')).toBeTruthy();
    });
  });
});

describe('profit-chart.tsx — ProfitChart', () => {
  it('renders with data', async () => {
    render(
      <ProfitChart data={sampleData} loadingMessage="Cargando..." emptyMessage="Sin datos" />
    );
    await waitFor(() => {
      expect(screen.getByTestId('profit-chart-core')).toBeTruthy();
    });
    expect(screen.getByText('Profit: 2 points')).toBeTruthy();
  });

  it('renders empty message when no data', async () => {
    render(
      <ProfitChart data={[]} loadingMessage="Cargando..." emptyMessage="Sin datos" />
    );
    await waitFor(() => {
      expect(screen.getByText('Sin datos')).toBeTruthy();
    });
  });
});
