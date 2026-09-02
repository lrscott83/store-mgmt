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
    paymentStartDate: '2024-01-01',
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
        <StoreCardList stores={stores} onEdit={vi.fn()} onApprove={vi.fn()} onDisapprove={vi.fn()} onToggle={vi.fn()} />
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
        <StoreCardList stores={[makeStore()]} onEdit={vi.fn()} onApprove={vi.fn()} onDisapprove={vi.fn()} onToggle={vi.fn()} />
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
        <StoreCardList stores={[]} onEdit={vi.fn()} onApprove={vi.fn()} onDisapprove={vi.fn()} onToggle={vi.fn()} />
      </Wrapper>
    );
    expect(screen.getByText(/no hay tiendas/i)).toBeInTheDocument();
  });
});

describe('StoreCardList — gear menu actions wired', () => {
  it('calls onEdit with the store id when Editar is clicked', async () => {
    const onEdit = vi.fn();
    const { StoreCardList } = await import('../store-card-list');
    render(
      <Wrapper>
        <StoreCardList
          stores={[makeStore({ id: 'store-x', name: 'Store X' })]}
          onEdit={onEdit}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()} onToggle={vi.fn()}
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByTestId('store-actions-toggle-store-x'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.EDIT'] }));
    expect(onEdit).toHaveBeenCalledWith('store-x');
  });

  it('calls onApprove with the store id when Aprobar is clicked', async () => {
    const onApprove = vi.fn();
    const { StoreCardList } = await import('../store-card-list');
    render(
      <Wrapper>
        <StoreCardList
          stores={[makeStore({ id: 'store-y', name: 'Store Y', approved: false })]}
          onEdit={vi.fn()}
          onApprove={onApprove}
          onDisapprove={vi.fn()} onToggle={vi.fn()}
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByTestId('store-actions-toggle-store-y'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.APPROVE'] }));
    expect(onApprove).toHaveBeenCalledWith('store-y');
  });

  it('calls onDisapprove with the store id when Desaprobar is clicked', async () => {
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
    fireEvent.click(screen.getByTestId('store-actions-toggle-store-z'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.DISAPPROVE'] }));
    expect(onDisapprove).toHaveBeenCalledWith('store-z');
  });
});

describe('StoreCardList — Approve XOR Disapprove (Req: Card-Grid List Uses Shared Chrome)', () => {
  it('approved store renders ONLY Desaprobar, not Aprobar (S-GM-STORE-1)', async () => {
    const { StoreCardList } = await import('../store-card-list');
    render(
      <Wrapper>
        <StoreCardList
          stores={[makeStore({ id: 'store-a', approved: true })]}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()} onToggle={vi.fn()}
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByTestId('store-actions-toggle-store-a'));
    const editItem = screen.getByRole('menuitem', { name: esMessages['STORES.EDIT'] });
    const disapproveItem = screen.getByRole('menuitem', { name: esMessages['STORES.DISAPPROVE'] });
    expect(editItem).toHaveClass('text-primary');
    expect(disapproveItem).toHaveClass('text-warning');
    expect(
      screen.queryByRole('menuitem', { name: esMessages['STORES.APPROVE'] })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('unapproved store renders ONLY Aprobar, not Desaprobar (S-GM-STORE-2)', async () => {
    const { StoreCardList } = await import('../store-card-list');
    render(
      <Wrapper>
        <StoreCardList
          stores={[makeStore({ id: 'store-b', approved: false })]}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()} onToggle={vi.fn()}
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByTestId('store-actions-toggle-store-b'));
    const approveItem = screen.getByRole('menuitem', { name: esMessages['STORES.APPROVE'] });
    expect(approveItem).toHaveClass('text-success');
    expect(
      screen.queryByRole('menuitem', { name: esMessages['STORES.DISAPPROVE'] })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });
});

describe('StoreCardList — state CSS (Req: Store Card Visual Lifecycle State)', () => {
  it('inactive store applies the danger state class', async () => {
    const { StoreCardList } = await import('../store-card-list');
    const { container } = render(
      <Wrapper>
        <StoreCardList
          stores={[makeStore({ isActive: false, approved: true })]}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()} onToggle={vi.fn()}
        />
      </Wrapper>
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card).toHaveClass('bg-danger/10', 'border-danger');
  });

  it('unapproved-but-active store applies the warning state class (matches Angular disapproved-store)', async () => {
    const { StoreCardList } = await import('../store-card-list');
    const { container } = render(
      <Wrapper>
        <StoreCardList
          stores={[makeStore({ isActive: true, approved: false })]}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()} onToggle={vi.fn()}
        />
      </Wrapper>
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card).toHaveClass('bg-warning/10', 'border-warning');
    expect(card).not.toHaveClass('bg-success/10');
  });

  it('normal store (active and approved) has no extra state class', async () => {
    const { StoreCardList } = await import('../store-card-list');
    const { container } = render(
      <Wrapper>
        <StoreCardList
          stores={[makeStore({ isActive: true, approved: true })]}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()} onToggle={vi.fn()}
        />
      </Wrapper>
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card).not.toHaveClass('bg-danger/10');
    expect(card).not.toHaveClass('bg-warning/10');
  });

  it('inactive + unapproved store applies danger, NOT warning (precedence)', async () => {
    const { StoreCardList } = await import('../store-card-list');
    const { container } = render(
      <Wrapper>
        <StoreCardList
          stores={[makeStore({ isActive: false, approved: false })]}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()} onToggle={vi.fn()}
        />
      </Wrapper>
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card).toHaveClass('bg-danger/10', 'border-danger');
    expect(card).not.toHaveClass('bg-warning/10');
  });
});

describe('StoreCardList — Change Plan gear item (spec store-plan-toggle R3)', () => {
  it('renders "Cambiar plan" for an active store and calls onToggle with the id', async () => {
    const onToggle = vi.fn();
    const { StoreCardList } = await import('../store-card-list');
    render(
      <Wrapper>
        <StoreCardList
          stores={[makeStore({ id: 'store-t', name: 'Store T', isActive: true })]}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
          onToggle={onToggle}
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByTestId('store-actions-toggle-store-t'));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['STORES.CHANGE_PLAN'] }));
    expect(onToggle).toHaveBeenCalledWith('store-t');
  });

  it('hides "Cambiar plan" when the store is inactive (spec scenario: Inactive store hides Change Plan)', async () => {
    const onToggle = vi.fn();
    const { StoreCardList } = await import('../store-card-list');
    render(
      <Wrapper>
        <StoreCardList
          stores={[makeStore({ id: 'store-i', name: 'Store I', isActive: false })]}
          onEdit={vi.fn()}
          onApprove={vi.fn()}
          onDisapprove={vi.fn()}
          onToggle={onToggle}
        />
      </Wrapper>
    );
    fireEvent.click(screen.getByTestId('store-actions-toggle-store-i'));
    expect(
      screen.queryByRole('menuitem', { name: esMessages['STORES.CHANGE_PLAN'] })
    ).not.toBeInTheDocument();
  });
});

describe('StoreCardList — Activate/Deactivate removed (Req: Activate/Deactivate Controls Removed)', () => {
  it('does NOT render Activate or Deactivate buttons', async () => {
    const { StoreCardList } = await import('../store-card-list');
    render(
      <Wrapper>
        <StoreCardList stores={[makeStore()]} onEdit={vi.fn()} onApprove={vi.fn()} onDisapprove={vi.fn()} onToggle={vi.fn()} />
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
