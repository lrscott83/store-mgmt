import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { InventoryEntryView } from '@store-mgmt/domain';
import { Currency } from '@store-mgmt/domain';
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

  it('renders no column header row (Angular entry-list has a bare tbody, no thead)', () => {
    const { container } = render(
      <Wrapper>
        <EntryList entries={[makeEntry()]} isOwnerAdmin onEdit={vi.fn()} onDeactivate={vi.fn()} />
      </Wrapper>,
    );
    // Angular entry-list.component.html is a `table-borderless` with a bare <tbody> — no header row.
    expect(container.querySelector('thead')).toBeNull();
    expect(container.querySelectorAll('th').length).toBe(0);
    const tbody = container.querySelector('tbody') as HTMLElement;
    expect(tbody.className).not.toMatch(/divide-y/);
  });

  it('renders the cost price in the entry currency without a $ prefix (thousands separator kept)', () => {
    render(
      <Wrapper>
        <EntryList
          entries={[makeEntry({ costPrice: 2000, currency: Currency.CUP })]}
          isOwnerAdmin
          onEdit={vi.fn()}
          onDeactivate={vi.fn()}
        />
      </Wrapper>,
    );
    // textContent (not getByText): the NBSP grouping must survive verbatim.
    const costCell = screen.getByText('Coca Cola').closest('tr')!.children[2]!;
    expect(costCell.textContent).toBe('2\u00A0000\u00A0CUP');
  });

  it('renders foreign-currency costs with their code (no $ prefix)', () => {
    render(
      <Wrapper>
        <EntryList
          entries={[makeEntry({ costPrice: 23456.7, currency: Currency.USD })]}
          isOwnerAdmin
          onEdit={vi.fn()}
          onDeactivate={vi.fn()}
        />
      </Wrapper>,
    );
    const costCell = screen.getByText('Coca Cola').closest('tr')!.children[2]!;
    expect(costCell.textContent).toBe('23\u00A0456.70\u00A0USD');
  });

  it('falls back to CUP when the entry has no stored currency (legacy data)', () => {
    render(
      <Wrapper>
        <EntryList
          entries={[makeEntry({ costPrice: 50, currency: undefined })]}
          isOwnerAdmin
          onEdit={vi.fn()}
          onDeactivate={vi.fn()}
        />
      </Wrapper>,
    );
    const costCell = screen.getByText('Coca Cola').closest('tr')!.children[2]!;
    expect(costCell.textContent).toBe('50\u00A0CUP');
  });
});
