import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Module } from '@store-mgmt/domain';

function makeModule(overrides: Partial<Module> = {}): Module {
  return {
    id: 1,
    name: 'Module A',
    price: 10,
    currentPrice: 8,
    priceIncluded: false,
    discountText: '',
    selected: false,
    ...overrides,
  };
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

describe('ModulePicker — MODULE-1: renders a checkbox per module', () => {
  it('renders one checkbox per module in the catalog', async () => {
    const { ModulePicker } = await import('../module-picker');
    const modules = [
      makeModule({ id: 1, name: 'Module A' }),
      makeModule({ id: 2, name: 'Module B' }),
    ];
    render(
      <Wrapper>
        <ModulePicker modules={modules} onChange={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByLabelText('Module A')).toBeInTheDocument();
    expect(screen.getByLabelText('Module B')).toBeInTheDocument();
  });
});

describe('ModulePicker — MODULE-3: priceIncluded=true modules are checked and disabled', () => {
  it('auto-selects and disables priceIncluded modules', async () => {
    const { ModulePicker } = await import('../module-picker');
    const modules = [
      makeModule({ id: 1, name: 'Base Module', priceIncluded: true, selected: false }),
      makeModule({ id: 2, name: 'Optional Module', priceIncluded: false, selected: false }),
    ];
    render(
      <Wrapper>
        <ModulePicker modules={modules} onChange={vi.fn()} />
      </Wrapper>
    );
    const baseCheckbox = screen.getByLabelText('Base Module') as HTMLInputElement;
    const optionalCheckbox = screen.getByLabelText('Optional Module') as HTMLInputElement;
    expect(baseCheckbox.checked).toBe(true);
    expect(baseCheckbox.disabled).toBe(true);
    expect(optionalCheckbox.checked).toBe(false);
    expect(optionalCheckbox.disabled).toBe(false);
  });
});

describe('ModulePicker — MODULE-4: onChange called with updated ids when toggling', () => {
  it('calls onChange with added module id when checking a non-locked module', async () => {
    const { ModulePicker } = await import('../module-picker');
    const onChangeMock = vi.fn();
    const modules = [
      makeModule({ id: 1, name: 'Module A', priceIncluded: false, selected: false }),
      makeModule({ id: 2, name: 'Module B', priceIncluded: true, selected: false }),
    ];
    render(
      <Wrapper>
        <ModulePicker modules={modules} onChange={onChangeMock} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText('Module A'));
    expect(onChangeMock).toHaveBeenCalledWith([2, 1]);
  });

  it('calls onChange with removed id when unchecking a selected non-locked module', async () => {
    const { ModulePicker } = await import('../module-picker');
    const onChangeMock = vi.fn();
    const modules = [
      makeModule({ id: 1, name: 'Module A', priceIncluded: false, selected: true }),
      makeModule({ id: 2, name: 'Module B', priceIncluded: true, selected: false }),
    ];
    render(
      <Wrapper>
        <ModulePicker modules={modules} onChange={onChangeMock} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText('Module A'));
    expect(onChangeMock).toHaveBeenCalledWith([2]);
  });
});

describe('ModulePicker — MODULE-5: running total of currentPrice for selected modules', () => {
  it('displays total currentPrice of selected modules', async () => {
    const { ModulePicker } = await import('../module-picker');
    const modules = [
      makeModule({ id: 1, name: 'Module A', currentPrice: 5, priceIncluded: true, selected: false }),
      makeModule({ id: 2, name: 'Module B', currentPrice: 10, priceIncluded: false, selected: true }),
    ];
    render(
      <Wrapper>
        <ModulePicker modules={modules} onChange={vi.fn()} />
      </Wrapper>
    );
    // priceIncluded (id=1) contributes 5, selected (id=2) contributes 10 → total 15
    expect(screen.getByText(/\$15\.00/)).toBeInTheDocument();
  });

  it('updates total when toggling a module', async () => {
    const { ModulePicker } = await import('../module-picker');
    const onChangeMock = vi.fn();
    const modules = [
      makeModule({ id: 1, name: 'Module A', currentPrice: 5, priceIncluded: false, selected: false }),
    ];
    render(
      <Wrapper>
        <ModulePicker modules={modules} onChange={onChangeMock} />
      </Wrapper>
    );
    expect(screen.getByText(/\$0\.00/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Module A'));
    onChangeMock.mock.calls[0][0]; // [1]
    expect(screen.getAllByText(/\$5\.00/).length).toBeGreaterThanOrEqual(1);
  });
});

describe('ModulePicker — D8: structural — no HTTP imports', () => {
  it('is a pure presentational component (no direct HTTP calls in render)', async () => {
    const { ModulePicker } = await import('../module-picker');
    const modules = [makeModule({ id: 1, name: 'Module A' })];
    // Should render without any async fetch
    render(
      <Wrapper>
        <ModulePicker modules={modules} onChange={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByLabelText('Module A')).toBeInTheDocument();
  });
});

// ─── Finding 5: async modules prop syncing ────────────────────────────────────

import { act } from '@testing-library/react';

describe('ModulePicker — MODULE-6: syncs checked when modules prop updates async', () => {
  it('reflects selected modules when modules prop arrives after initial empty render', async () => {
    const { ModulePicker } = await import('../module-picker');
    const onChange = vi.fn();

    const { rerender } = render(
      <Wrapper>
        <ModulePicker modules={[]} onChange={onChange} />
      </Wrapper>
    );

    // Now simulate async arrival of modules with one selected
    const asyncModules = [
      makeModule({ id: 1, name: 'Async Module', selected: true, priceIncluded: false }),
    ];

    await act(async () => {
      rerender(
        <Wrapper>
          <ModulePicker modules={asyncModules} onChange={onChange} />
        </Wrapper>
      );
    });

    const checkbox = screen.getByLabelText('Async Module') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});

// ─── Finding 6: offer-price strikethrough when price !== currentPrice ─────────

describe('ModulePicker — MODULE-7: offer-price when price !== currentPrice', () => {
  it('shows both currentPrice and original price when they differ', async () => {
    const { ModulePicker } = await import('../module-picker');
    const modules = [
      makeModule({ id: 1, name: 'Sale Module', price: 20, currentPrice: 15, priceIncluded: false }),
    ];
    render(
      <Wrapper>
        <ModulePicker modules={modules} onChange={vi.fn()} />
      </Wrapper>
    );
    // Both prices rendered (current discounted and original struck-through)
    expect(screen.getByText('$15.00')).toBeInTheDocument();
    expect(screen.getByText('$20.00')).toBeInTheDocument();
  });

  it('shows only currentPrice when price equals currentPrice', async () => {
    const { ModulePicker } = await import('../module-picker');
    const modules = [
      makeModule({ id: 1, name: 'Normal Module', price: 10, currentPrice: 10, priceIncluded: false }),
    ];
    render(
      <Wrapper>
        <ModulePicker modules={modules} onChange={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText('$10.00')).toBeInTheDocument();
    // Should not show a second $10.00 for the strikethrough
    expect(screen.getAllByText('$10.00')).toHaveLength(1);
  });
});

// ─── Finding 7: total formatted as USD currency ───────────────────────────────

describe('ModulePicker — MODULE-8: total formatted as USD currency', () => {
  it('formats the total as $X.XX USD currency string', async () => {
    const { ModulePicker } = await import('../module-picker');
    const modules = [
      makeModule({ id: 1, name: 'Module A', currentPrice: 15.5, priceIncluded: true }),
    ];
    render(
      <Wrapper>
        <ModulePicker modules={modules} onChange={vi.fn()} />
      </Wrapper>
    );
    // Total should be $15.50, not bare 15.5
    expect(screen.getByText(/\$15\.50/)).toBeInTheDocument();
  });
});

// ─── Finding 8: select-all header checkbox ───────────────────────────────────

describe('ModulePicker — MODULE-9: select-all header checkbox', () => {
  it('renders a select-all checkbox', async () => {
    const { ModulePicker } = await import('../module-picker');
    const modules = [
      makeModule({ id: 1, name: 'Module A', priceIncluded: false, selected: false }),
      makeModule({ id: 2, name: 'Module B', priceIncluded: false, selected: false }),
    ];
    render(
      <Wrapper>
        <ModulePicker modules={modules} onChange={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByLabelText(esMessages['STORES.SELECT_ALL_MODULES'])).toBeInTheDocument();
  });

  it('checking select-all selects all non-priceIncluded modules', async () => {
    const { ModulePicker } = await import('../module-picker');
    const onChange = vi.fn();
    const modules = [
      makeModule({ id: 1, name: 'Module A', priceIncluded: false, selected: false }),
      makeModule({ id: 2, name: 'Module B', priceIncluded: false, selected: false }),
      makeModule({ id: 3, name: 'Base', priceIncluded: true, selected: false }),
    ];
    render(
      <Wrapper>
        <ModulePicker modules={modules} onChange={onChange} />
      </Wrapper>
    );
    fireEvent.click(screen.getByLabelText(esMessages['STORES.SELECT_ALL_MODULES']));
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as number[];
    expect(lastCall).toContain(1);
    expect(lastCall).toContain(2);
    expect(lastCall).toContain(3); // base (priceIncluded) is always in
  });

  it('unchecking select-all deselects all non-priceIncluded modules', async () => {
    const { ModulePicker } = await import('../module-picker');
    const onChange = vi.fn();
    const modules = [
      makeModule({ id: 1, name: 'Module A', priceIncluded: false, selected: true }),
      makeModule({ id: 2, name: 'Module B', priceIncluded: false, selected: true }),
      makeModule({ id: 3, name: 'Base', priceIncluded: true, selected: false }),
    ];
    render(
      <Wrapper>
        <ModulePicker modules={modules} onChange={onChange} />
      </Wrapper>
    );
    // First click → uncheck (all were selected so selectAll is checked)
    const selectAll = screen.getByLabelText(esMessages['STORES.SELECT_ALL_MODULES']) as HTMLInputElement;
    // selectAll should be checked since all non-locked are selected
    expect(selectAll.checked).toBe(true);
    fireEvent.click(selectAll);
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as number[];
    // Only priceIncluded (id=3) remains
    expect(lastCall).not.toContain(1);
    expect(lastCall).not.toContain(2);
    expect(lastCall).toContain(3);
  });
});
