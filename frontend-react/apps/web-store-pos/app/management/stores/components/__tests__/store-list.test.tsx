import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Store } from '@store-mgmt/domain';

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 's1',
    name: 'Store One',
    displayName: 'Store One',
    ownerId: 'o1',
    ownerName: 'Owner One',
    address: '123 Main St',
    description: 'A store',
    approved: true,
    paymentStartDate: new Date(),
    modules: [],
    isActive: true,
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

describe('StoreList — PRES-1: renders store rows', () => {
  it('renders a row per store with the store name', async () => {
    const { StoreList } = await import('../store-list');
    const stores = [
      makeStore({ id: 's1', name: 'Store Alpha' }),
      makeStore({ id: 's2', name: 'Store Beta' }),
    ];
    render(
      <Wrapper>
        <StoreList
          stores={stores}
          isOnline={true}
          isDegraded={false}
          onCreate={vi.fn()}
          onEdit={vi.fn()}
          onActivate={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
          onDeactivate={vi.fn()}
          error=""
        />
      </Wrapper>
    );
    expect(screen.getByText('Store Alpha')).toBeInTheDocument();
    expect(screen.getByText('Store Beta')).toBeInTheDocument();
  });
});

describe('StoreList — PRES-3: empty state', () => {
  it('shows empty state message when stores array is empty', async () => {
    const { StoreList } = await import('../store-list');
    render(
      <Wrapper>
        <StoreList
          stores={[]}
          isOnline={true}
          isDegraded={false}
          onCreate={vi.fn()}
          onEdit={vi.fn()}
          onActivate={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
          onDeactivate={vi.fn()}
          error=""
        />
      </Wrapper>
    );
    expect(screen.getByText(/no hay tiendas/i)).toBeInTheDocument();
  });
});

describe('StoreList — PRES-2: degraded indicator', () => {
  it('shows degraded notice when isDegraded is true', async () => {
    const { StoreList } = await import('../store-list');
    render(
      <Wrapper>
        <StoreList
          stores={[makeStore()]}
          isOnline={false}
          isDegraded={true}
          onCreate={vi.fn()}
          onEdit={vi.fn()}
          onActivate={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
          onDeactivate={vi.fn()}
          error=""
        />
      </Wrapper>
    );
    expect(screen.getByText(/caché/i)).toBeInTheDocument();
  });
});

describe('StoreList — LIST-4: onCreate callback', () => {
  it('calls onCreate when create button is clicked', async () => {
    const { StoreList } = await import('../store-list');
    const onCreate = vi.fn();
    render(
      <Wrapper>
        <StoreList
          stores={[]}
          isOnline={true}
          isDegraded={false}
          onCreate={onCreate}
          onEdit={vi.fn()}
          onActivate={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
          onDeactivate={vi.fn()}
          error=""
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /crear tienda/i }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

describe('StoreList — LIST-4: onEdit callback', () => {
  it('calls onEdit with the store id when edit button is clicked', async () => {
    const { StoreList } = await import('../store-list');
    const onEdit = vi.fn();
    const store = makeStore({ id: 'store-x', name: 'Store X' });
    render(
      <Wrapper>
        <StoreList
          stores={[store]}
          isOnline={true}
          isDegraded={false}
          onCreate={vi.fn()}
          onEdit={onEdit}
          onActivate={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
          onDeactivate={vi.fn()}
          error=""
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /editar/i }));
    expect(onEdit).toHaveBeenCalledWith('store-x');
  });
});

describe('StoreList — LIST-5: lifecycle actions disabled offline', () => {
  it('disables lifecycle action buttons when offline', async () => {
    const { StoreList } = await import('../store-list');
    render(
      <Wrapper>
        <StoreList
          stores={[makeStore()]}
          isOnline={false}
          isDegraded={true}
          onCreate={vi.fn()}
          onEdit={vi.fn()}
          onActivate={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
          onDeactivate={vi.fn()}
          error=""
        />
      </Wrapper>
    );
    // All action buttons except create should be disabled when offline
    const editBtn = screen.getByRole('button', { name: /^editar$/i });
    expect(editBtn).toBeDisabled();
  });
});

describe('StoreList — ERR-3: error display', () => {
  it('shows inline error when error prop is set', async () => {
    const { StoreList } = await import('../store-list');
    render(
      <Wrapper>
        <StoreList
          stores={[]}
          isOnline={true}
          isDegraded={false}
          onCreate={vi.fn()}
          onEdit={vi.fn()}
          onActivate={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
          onDeactivate={vi.fn()}
          error="Failed to load stores"
        />
      </Wrapper>
    );
    expect(screen.getByText('Failed to load stores')).toBeInTheDocument();
  });
});

// ─── S-PRES-OPTIONAL: optional activate/deactivate handlers ───────────────────

describe('StoreList — S-PRES-OPTIONAL-1: Activate button absent when handler omitted', () => {
  it('does NOT render Activate button when onActivate is not provided', async () => {
    const { StoreList } = await import('../store-list');
    const store = makeStore({ id: 's1', name: 'Store One' });
    render(
      <Wrapper>
        <StoreList
          stores={[store]}
          isOnline={true}
          isDegraded={false}
          onCreate={vi.fn()}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
          error={undefined}
        />
      </Wrapper>
    );
    expect(
      screen.queryByRole('button', { name: esMessages['STORES.ACTIVATE'] })
    ).not.toBeInTheDocument();
  });
});

describe('StoreList — S-PRES-OPTIONAL-2: Deactivate button absent when handler omitted', () => {
  it('does NOT render Deactivate button when onDeactivate is not provided', async () => {
    const { StoreList } = await import('../store-list');
    const store = makeStore({ id: 's1', name: 'Store One' });
    render(
      <Wrapper>
        <StoreList
          stores={[store]}
          isOnline={true}
          isDegraded={false}
          onCreate={vi.fn()}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
          error={undefined}
        />
      </Wrapper>
    );
    expect(
      screen.queryByRole('button', { name: esMessages['STORES.DEACTIVATE'] })
    ).not.toBeInTheDocument();
  });
});

describe('StoreList — S-PRES-OPTIONAL-3: Activate button rendered when handler provided', () => {
  it('renders Activate button when onActivate is provided', async () => {
    const { StoreList } = await import('../store-list');
    const store = makeStore({ id: 's1', name: 'Store One' });
    const onActivate = vi.fn();
    render(
      <Wrapper>
        <StoreList
          stores={[store]}
          isOnline={true}
          isDegraded={false}
          onCreate={vi.fn()}
          onEdit={vi.fn()}
          onActivate={onActivate}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
          error={undefined}
        />
      </Wrapper>
    );
    expect(
      screen.getByRole('button', { name: esMessages['STORES.ACTIVATE'] })
    ).toBeInTheDocument();
  });
});

describe('StoreList — S-PRES-OPTIONAL-4: Deactivate button rendered when handler provided', () => {
  it('renders Deactivate button when onDeactivate is provided', async () => {
    const { StoreList } = await import('../store-list');
    const store = makeStore({ id: 's1', name: 'Store One' });
    const onDeactivate = vi.fn();
    render(
      <Wrapper>
        <StoreList
          stores={[store]}
          isOnline={true}
          isDegraded={false}
          onCreate={vi.fn()}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
          onDeactivate={onDeactivate}
          error={undefined}
        />
      </Wrapper>
    );
    expect(
      screen.getByRole('button', { name: esMessages['STORES.DEACTIVATE'] })
    ).toBeInTheDocument();
  });
});
