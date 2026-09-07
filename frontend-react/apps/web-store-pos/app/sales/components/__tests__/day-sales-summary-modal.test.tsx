import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { DaySalesSummaryModal } from '../day-sales-summary-modal';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

// money-never-wraps — the per-day Resumen de ventas modal (opened from the
// sales-history day gear menu) shows four money metrics in a 4-column grid;
// on narrow screens a grouped amount like $1 234 567.89 must never split
// across lines. formatCurrency groups thousands with U+00A0 (NBSP) and the
// modal wraps every metric value in whitespace-nowrap. Pinned per user
// report: amounts were being cut when the day panel expanded.
describe('DaySalesSummaryModal — money never wraps (no-cut invariant)', () => {
  const summary = {
    date: new Date('2026-09-06'),
    orderCount: 42,
    totalRevenue: 1234567.89,
    totalCost: 234567.89,
    totalProfit: 999999.99,
  };

  it('renders all four metrics', () => {
    render(
      <Wrapper>
        <DaySalesSummaryModal summary={summary} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('42')).toBeInTheDocument();
    // getByText normalizes NBSP → space, so matchers use the plain-space shape.
    expect(screen.getByText('$1 234 567.89')).toBeInTheDocument();
    expect(screen.getByText('$234 567.89')).toBeInTheDocument();
    expect(screen.getByText('$999 999.99')).toBeInTheDocument();
  });

  it('renders every money metric inside a whitespace-nowrap element', () => {
    render(
      <Wrapper>
        <DaySalesSummaryModal summary={summary} onClose={vi.fn()} />
      </Wrapper>,
    );
    for (const text of ['$1 234 567.89', '$234 567.89', '$999 999.99']) {
      const el = screen.getByText(text);
      expect(el.className, `${text} must carry whitespace-nowrap`).toMatch(/whitespace-nowrap/);
    }
  });

  it('formats amounts with the NBSP-grouped formatter (byte-level no-break)', () => {
    render(
      <Wrapper>
        <DaySalesSummaryModal summary={summary} onClose={vi.fn()} />
      </Wrapper>,
    );
    // Byte-level: the rendered DOM textContent carries U+00A0, not a regular
    // space — the browser has no break opportunity inside the amount.
    const revenue = screen.getByText('$1 234 567.89');
    expect(revenue.textContent).toContain('$1\u00A0234\u00A0567.89');
  });
});
