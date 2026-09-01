import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Owner, OwnerStoreModule } from '@store-mgmt/domain';

function makeModule(price = 100, nextDueDate: string | null = null): OwnerStoreModule {
  return {
    storeId: `s-${Math.random()}`,
    storeName: 'Store A',
    storeModuleTotalCurrentPrice: price,
    nextDueDate,
  };
}

function makeOwner(overrides: Partial<Owner> = {}): Owner {
  return {
    id: 'o1',
    userId: 'u1',
    fullName: 'John Owner',
    cellPhone: '+53 5 123-4567',
    email: 'john@example.com',
    description: 'An owner',
    guest: false,
    isActive: true,
    reSellerId: 'r1',
    reSellerName: 'Best Reseller',
    approved: true,
    storeModules: [makeModule(200), makeModule(300)],
    createdDate: new Date('2024-01-01'),
    createdByName: 'admin',
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

const baseProps = {
  onEdit: vi.fn(),
  onDelete: vi.fn(),
};

describe('OwnerCardList — renders a Card grid (Req: Owners List Card Grid)', () => {
  it('renders a 3-column responsive grid', async () => {
    const { OwnerCardList } = await import('../owner-card-list');
    const { container } = render(
      <Wrapper>
        <OwnerCardList {...baseProps} owners={[makeOwner()]} />
      </Wrapper>
    );
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('sm:grid-cols-2');
    expect(grid?.className).toContain('lg:grid-cols-3');
  });

  it('renders one Card per owner with fullName, store-price line, GENERAL.RESELLER line, phone, email, description', async () => {
    const { OwnerCardList } = await import('../owner-card-list');
    const owners = [
      makeOwner({
        id: 'o1',
        fullName: 'Jane Owner',
        storeModules: [makeModule(150), makeModule(250)],
        reSellerName: 'My Reseller',
        cellPhone: '+53 5 555-1234',
        email: 'jane@test.com',
        description: 'Top owner',
      }),
    ];
    const { container } = render(
      <Wrapper>
        <OwnerCardList {...baseProps} owners={owners} />
      </Wrapper>
    );
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
    expect(screen.getByText('Jane Owner')).toBeInTheDocument();
    expect(screen.getByText(/2\s*tiendas/i)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${esMessages['GENERAL.RESELLER']}.*My Reseller`))
    ).toBeInTheDocument();
    expect(screen.getByText('+53 5 555-1234')).toBeInTheDocument();
    expect(screen.getByText('Top owner')).toBeInTheDocument();
  });

  it('shows reSellerName fallback ADMIN when empty', async () => {
    const { OwnerCardList } = await import('../owner-card-list');
    render(
      <Wrapper>
        <OwnerCardList {...baseProps} owners={[makeOwner({ reSellerName: '' })]} />
      </Wrapper>
    );
    expect(screen.getByText(/ADMIN/)).toBeInTheDocument();
  });
});

// Parity fix (presentation-parity-bucket-e item 4): owners.component.html:70 renders
// `{{ price | currency }} {{ getOwnerStoreCountText }}` → price first, then "en N tiendas",
// no em-dash. React's correct pluralization is preserved (Angular's own text is always
// singular — a bug we do NOT replicate).
describe('OwnerCardList — price·stores label order (Angular parity: owners.component.html:70)', () => {
  it('renders "$100.00 en 3 tiendas" (price first, "en" connective, plural preserved)', async () => {
    const { OwnerCardList } = await import('../owner-card-list');
    const owners = [
      makeOwner({
        id: 'o1',
        storeModules: [makeModule(40), makeModule(60)],
      }),
    ];
    render(
      <Wrapper>
        <OwnerCardList {...baseProps} owners={owners} />
      </Wrapper>
    );
    expect(screen.getByText('$100.00 en 2 tiendas')).toBeInTheDocument();
  });

  it('keeps singular "1 tienda" for a single store (React pluralization, not Angular\'s always-singular bug)', async () => {
    const { OwnerCardList } = await import('../owner-card-list');
    const owners = [
      makeOwner({
        id: 'o2',
        storeModules: [makeModule(100)],
      }),
    ];
    render(
      <Wrapper>
        <OwnerCardList {...baseProps} owners={owners} />
      </Wrapper>
    );
    expect(screen.getByText('$100.00 en 1 tienda')).toBeInTheDocument();
  });
});

describe('OwnerCardList — gear action menu (Req: Owners Gear Menu — Live Actions Only)', () => {
  it('menu is closed by default, opens on gear click, shows Editar + Eliminar only', async () => {
    const { OwnerCardList } = await import('../owner-card-list');
    render(
      <Wrapper>
        <OwnerCardList {...baseProps} owners={[makeOwner({ id: 'o-active' })]} />
      </Wrapper>
    );
    expect(screen.queryByRole('menuitem', { name: esMessages['OWNER.EDIT_OWNER'] })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    expect(screen.getByRole('menuitem', { name: esMessages['OWNER.EDIT_OWNER'] })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: esMessages['GENERAL.DELETE'] })).toBeInTheDocument();
    // exactly two menu items — no Aprobar/Activar/Desactivar
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('does NOT render Aprobar/Activar/Desactivar menu items', async () => {
    const { OwnerCardList } = await import('../owner-card-list');
    render(
      <Wrapper>
        <OwnerCardList {...baseProps} owners={[makeOwner({ id: 'o-x' })]} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    expect(screen.queryByRole('menuitem', { name: /aprobar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /activar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /desactivar/i })).not.toBeInTheDocument();
  });

  it('calls onEdit(id) when Editar is clicked', async () => {
    const onEdit = vi.fn();
    const { OwnerCardList } = await import('../owner-card-list');
    render(
      <Wrapper>
        <OwnerCardList {...baseProps} onEdit={onEdit} owners={[makeOwner({ id: 'o-edit' })]} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['OWNER.EDIT_OWNER'] }));
    expect(onEdit).toHaveBeenCalledWith('o-edit');
  });

  it('opens confirm dialog on Eliminar and calls onDelete(id) only after confirming', async () => {
    const onDelete = vi.fn();
    const { OwnerCardList } = await import('../owner-card-list');
    render(
      <Wrapper>
        <OwnerCardList {...baseProps} onDelete={onDelete} owners={[makeOwner({ id: 'o-del' })]} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['GENERAL.DELETE'] }));

    // The delete action opens a confirm dialog; onDelete must NOT fire until confirmed.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: esMessages['OWNER.DELETE_CONFIRM_BUTTON'] }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('o-del');
  });

  it('S-GM-OWNER-1: Editar is text-primary and Eliminar is text-danger preceded by a separator', async () => {
    const { OwnerCardList } = await import('../owner-card-list');
    render(
      <Wrapper>
        <OwnerCardList {...baseProps} owners={[makeOwner({ id: 'o-color' })]} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    const editItem = screen.getByRole('menuitem', { name: esMessages['OWNER.EDIT_OWNER'] });
    const deleteItem = screen.getByRole('menuitem', { name: esMessages['GENERAL.DELETE'] });
    expect(editItem).toHaveClass('text-primary');
    expect(deleteItem).toHaveClass('text-danger');
    expect(deleteItem.previousElementSibling).toHaveAttribute('role', 'separator');
  });
});

describe('OwnerCardList — state indicator classes (Req: Owners State CSS Classes)', () => {
  it('applies bg-danger indicator when isActive is false', async () => {
    const { OwnerCardList } = await import('../owner-card-list');
    const { container } = render(
      <Wrapper>
        <OwnerCardList {...baseProps} owners={[makeOwner({ isActive: false, approved: true })]} />
      </Wrapper>
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card?.className).toContain('bg-danger');
  });

  it('applies bg-success indicator when approved is false (and isActive true)', async () => {
    const { OwnerCardList } = await import('../owner-card-list');
    const { container } = render(
      <Wrapper>
        <OwnerCardList {...baseProps} owners={[makeOwner({ isActive: true, approved: false })]} />
      </Wrapper>
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card?.className).toContain('bg-success');
  });

  it('applies no indicator when isActive true and approved true', async () => {
    const { OwnerCardList } = await import('../owner-card-list');
    const { container } = render(
      <Wrapper>
        <OwnerCardList {...baseProps} owners={[makeOwner({ isActive: true, approved: true })]} />
      </Wrapper>
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card?.className).not.toContain('bg-danger');
    expect(card?.className).not.toContain('bg-success');
  });
});
