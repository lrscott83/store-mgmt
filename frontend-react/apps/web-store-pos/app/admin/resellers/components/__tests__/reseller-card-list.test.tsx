import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { ReSeller } from '@store-mgmt/domain';

function makeReseller(overrides: Partial<ReSeller> = {}): ReSeller {
  return {
    id: 'r1',
    userId: 'u1',
    fullName: 'John Reseller',
    percentDiscountPrice: 10,
    discountPrice: 5,
    cellPhone: '+53 5 123-4567',
    email: 'john@example.com',
    description: 'A reseller',
    guest: false,
    isActive: true,
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
  onCreate: vi.fn(),
  onEdit: vi.fn(),
};

describe('ResellerCardList — renders a Card grid (Req: Resellers List Card Grid)', () => {
  it('renders a 3-column responsive grid', async () => {
    const { ResellerCardList } = await import('../reseller-card-list');
    const { container } = render(
      <Wrapper>
        <ResellerCardList {...baseProps} resellers={[makeReseller()]} />
      </Wrapper>
    );
    const grid = container.querySelector('.grid');
    expect(grid?.className).toContain('grid-cols-1');
    expect(grid?.className).toContain('sm:grid-cols-2');
    expect(grid?.className).toContain('lg:grid-cols-3');
  });

  it('renders one Card per reseller with discount/phone/email/description fields', async () => {
    const { ResellerCardList } = await import('../reseller-card-list');
    const resellers = [
      makeReseller({
        id: 'r1',
        fullName: 'Jane Reseller',
        percentDiscountPrice: 15,
        discountPrice: 8,
        cellPhone: '+53 5 555-1234',
        email: 'jane@test.com',
        description: 'Top reseller',
      }),
    ];
    const { container } = render(
      <Wrapper>
        <ResellerCardList {...baseProps} resellers={resellers} />
      </Wrapper>
    );
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
    expect(screen.getByText('Jane Reseller')).toBeInTheDocument();
    expect(screen.getByText(/15/)).toBeInTheDocument();
    expect(screen.getByText(/8/)).toBeInTheDocument();
    expect(screen.getByText('+53 5 555-1234')).toBeInTheDocument();
    expect(screen.getByText('jane@test.com')).toBeInTheDocument();
    expect(screen.getByText('Top reseller')).toBeInTheDocument();
  });
});

describe('ResellerCardList — FAB (Req: Resellers L6 Text Parity, override 1)', () => {
  it('FAB reads GENERAL.ADD ("Adicionar", not "Adicionar Gestor") and calls onCreate', async () => {
    const onCreate = vi.fn();
    const { ResellerCardList } = await import('../reseller-card-list');
    render(
      <Wrapper>
        <ResellerCardList {...baseProps} onCreate={onCreate} resellers={[]} />
      </Wrapper>
    );
    expect(esMessages['GENERAL.ADD']).toBe('Adicionar');
    const fab = screen.getByRole('button', { name: esMessages['GENERAL.ADD'] });
    expect(fab).toBeInTheDocument();
    fireEvent.click(fab);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

describe('ResellerCardList — gear action menu (Req: Resellers Gear Menu — Edit Only)', () => {
  it('menu is closed by default, opens on gear click, shows Editar only', async () => {
    const { ResellerCardList } = await import('../reseller-card-list');
    render(
      <Wrapper>
        <ResellerCardList {...baseProps} resellers={[makeReseller({ id: 'r-active' })]} />
      </Wrapper>
    );
    expect(screen.queryByRole('menuitem', { name: esMessages['GENERAL.EDIT'] })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    expect(screen.getByRole('menuitem', { name: esMessages['GENERAL.EDIT'] })).toBeInTheDocument();
    // exactly one menu item — no Activar/Desactivar/Eliminar
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
  });

  it('does NOT render Activar/Desactivar/Eliminar menu items', async () => {
    const { ResellerCardList } = await import('../reseller-card-list');
    render(
      <Wrapper>
        <ResellerCardList {...baseProps} resellers={[makeReseller({ id: 'r-x' })]} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    expect(screen.queryByRole('menuitem', { name: /activar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /desactivar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /eliminar/i })).not.toBeInTheDocument();
  });

  it('calls onEdit(id) when Editar is clicked', async () => {
    const onEdit = vi.fn();
    const { ResellerCardList } = await import('../reseller-card-list');
    render(
      <Wrapper>
        <ResellerCardList {...baseProps} onEdit={onEdit} resellers={[makeReseller({ id: 'r-edit' })]} />
      </Wrapper>
    );
    fireEvent.click(screen.getByRole('button', { name: /acciones/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: esMessages['GENERAL.EDIT'] }));
    expect(onEdit).toHaveBeenCalledWith('r-edit');
  });
});

describe('ResellerCardList — state indicator class (Req: Resellers State CSS Class)', () => {
  it('applies bg-danger indicator when isActive is false', async () => {
    const { ResellerCardList } = await import('../reseller-card-list');
    const { container } = render(
      <Wrapper>
        <ResellerCardList {...baseProps} resellers={[makeReseller({ isActive: false })]} />
      </Wrapper>
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card?.className).toContain('bg-danger');
  });

  it('applies no indicator when isActive is true', async () => {
    const { ResellerCardList } = await import('../reseller-card-list');
    const { container } = render(
      <Wrapper>
        <ResellerCardList {...baseProps} resellers={[makeReseller({ isActive: true })]} />
      </Wrapper>
    );
    const card = container.querySelector('[data-slot="card"]');
    expect(card?.className).not.toContain('bg-danger');
  });
});
