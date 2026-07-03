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

describe('StoreCardList — renders a Card grid (Req: Card-Grid List Uses Shared Chrome)', () => {
  it('renders a card per store with name, address and description', async () => {
    const { StoreCardList } = await import('../store-card-list');
    const stores = [
      makeStore({ id: 's1', name: 'Store Alpha', address: 'Addr A', description: 'Desc A' }),
      makeStore({ id: 's2', name: 'Store Beta', address: 'Addr B', description: 'Desc B' }),
    ];
    render(
      <Wrapper>
        <StoreCardList stores={stores} onEdit={vi.fn()} onApprove={vi.fn()} onDisapprove={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText('Store Alpha')).toBeInTheDocument();
    expect(screen.getByText('Addr A')).toBeInTheDocument();
    expect(screen.getByText('Desc A')).toBeInTheDocument();
    expect(screen.getByText('Store Beta')).toBeInTheDocument();
  });

  it('uses the shared Card chrome (data-slot="card")', async () => {
    const { StoreCardList } = await import('../store-card-list');
    const { container } = render(
      <Wrapper>
        <StoreCardList stores={[makeStore()]} onEdit={vi.fn()} onApprove={vi.fn()} onDisapprove={vi.fn()} />
      </Wrapper>
    );
    expect(container.querySelector('[data-slot="card"]')).toBeInTheDocument();
  });
});

describe('StoreCardList — empty state', () => {
  it('shows empty state message when stores array is empty', async () => {
    const { StoreCardList } = await import('../store-card-list');
    render(
      <Wrapper>
        <StoreCardList stores={[]} onEdit={vi.fn()} onApprove={vi.fn()} onDisapprove={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText(/no hay tiendas/i)).toBeInTheDocument();
  });
});

describe('StoreCardList — Button-based actions wired', () => {
  it('calls onEdit with the store id when the Edit button is clicked', async () => {
    const onEdit = vi.fn();
    const { StoreCardList } = await import('../store-card-list');
    render(
      <Wrapper>
        <StoreCardList
          stores={[makeStore({ id: 'store-x', name: 'Store X' })]}
          onEdit={onEdit}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: esMessages['STORES.EDIT'] }));
    expect(onEdit).toHaveBeenCalledWith('store-x');
  });

  it('calls onApprove with the store id when the Approve button is clicked', async () => {
    const onApprove = vi.fn();
    const { StoreCardList } = await import('../store-card-list');
    render(
      <Wrapper>
        <StoreCardList
          stores={[makeStore({ id: 'store-y', name: 'Store Y' })]}
          onEdit={vi.fn()}
          onApprove={onApprove}
          onDisapprove={vi.fn()}
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: esMessages['STORES.APPROVE'] }));
    expect(onApprove).toHaveBeenCalledWith('store-y');
  });

  it('calls onDisapprove with the store id when the Disapprove button is clicked', async () => {
    const onDisapprove = vi.fn();
    const { StoreCardList } = await import('../store-card-list');
    render(
      <Wrapper>
        <StoreCardList
          stores={[makeStore({ id: 'store-z', name: 'Store Z' })]}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={onDisapprove}
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: esMessages['STORES.DISAPPROVE'] }));
    expect(onDisapprove).toHaveBeenCalledWith('store-z');
  });
});

describe('StoreCardList — Activate/Deactivate removed (Req: Activate/Deactivate Controls Removed)', () => {
  it('does NOT render Activate or Deactivate buttons', async () => {
    const { StoreCardList } = await import('../store-card-list');
    render(
      <Wrapper>
        <StoreCardList stores={[makeStore()]} onEdit={vi.fn()} onApprove={vi.fn()} onDisapprove={vi.fn()} />
      </Wrapper>
    );
    expect(
      screen.queryByRole('button', { name: esMessages['STORES.ACTIVATE'] })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: esMessages['STORES.DEACTIVATE'] })
    ).not.toBeInTheDocument();
  });
});
