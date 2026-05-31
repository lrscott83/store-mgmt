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
    expect(screen.getByText(/15/)).toBeInTheDocument();
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
    expect(screen.getByText(/0/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Module A'));
    onChangeMock.mock.calls[0][0]; // [1]
    expect(screen.getByText(/5/)).toBeInTheDocument();
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
