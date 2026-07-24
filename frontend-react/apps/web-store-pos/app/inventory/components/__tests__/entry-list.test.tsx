import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { InventoryEntryView } from '@store-mgmt/domain';
import { EntryList } from '../entry-list';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeEntry(overrides: Partial<InventoryEntryView> = {}): InventoryEntryView {
  return {
    id: 'entry-1',
    productId: 'prod-1',
    productName: 'Coca Cola',
    quantity: 5,
    costPrice: 2000,
    date: new Date('2025-01-01'),
    isActive: true,
    ...overrides,
  };
}

describe('EntryList — list/table parity sweep (WU5)', () => {
  it('renders without an outer border/rounded wrapper', () => {
    const { container } = render(
      <Wrapper>
        <EntryList entries={[makeEntry()]} isOwnerAdmin onEdit={vi.fn()} onDeactivate={vi.fn()} />
      </Wrapper>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).not.toMatch(/\bborder\b/);
    expect(wrapper.className).not.toMatch(/\brounded\b/);
  });

  it('renders without a thead border or tbody row dividers', () => {
    const { container } = render(
      <Wrapper>
        <EntryList entries={[makeEntry()]} isOwnerAdmin onEdit={vi.fn()} onDeactivate={vi.fn()} />
      </Wrapper>,
    );
    const thead = container.querySelector('thead') as HTMLElement;
    const tbody = container.querySelector('tbody') as HTMLElement;
    expect(thead.className).not.toMatch(/border-b/);
    expect(tbody.className).not.toMatch(/divide-y/);
  });

  it('renders the cost price using formatCurrency (thousands separator)', () => {
    render(
      <Wrapper>
        <EntryList entries={[makeEntry({ costPrice: 2000 })]} isOwnerAdmin onEdit={vi.fn()} onDeactivate={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('$2,000.00')).toBeInTheDocument();
  });
});
