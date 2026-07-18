import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { ProductCategory } from '@store-mgmt/domain';
import { CreateProductModal } from '../create-product-modal';

// Text parity: Angular has no live create-product-modal template (it's a stub in Angular —
// create-product-modal.component.html is literally "<p>create-product-modal works!</p>"),
// but React's own validation copy must still be Spanish, using GENERAL.VALIDATION.REQUIRED
// exactly like every other audited form in this stage (edit-sale-credit-modal.tsx).
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeCategory(overrides: Partial<ProductCategory> = {}): ProductCategory {
  return { id: 'cat-1', name: 'Bebidas', order: 1, isActive: true, ...overrides };
}

describe('CreateProductModal — validation text parity (GENERAL.VALIDATION.REQUIRED)', () => {
  it('shows "Nombre es requerido" when name is empty', () => {
    render(
      <Wrapper>
        <CreateProductModal categories={[makeCategory()]} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('create-product-submit'));
    expect(screen.getByText('Nombre es requerido')).toBeInTheDocument();
  });

  it('shows "Precio es requerido" when price is empty', () => {
    render(
      <Wrapper>
        <CreateProductModal categories={[makeCategory()]} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Coca Cola' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));
    expect(screen.getByText('Precio es requerido')).toBeInTheDocument();
  });

  it('shows "Categoría es requerido" when categoryId is empty', () => {
    render(
      <Wrapper>
        <CreateProductModal categories={[]} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Coca Cola' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));
    expect(screen.getByText('Categoría es requerido')).toBeInTheDocument();
  });
});

describe('CreateProductModal — footer icons/labels parity', () => {
  it('close button reads "Cerrar" (not "Cancelar") and renders a close icon', () => {
    render(
      <Wrapper>
        <CreateProductModal categories={[makeCategory()]} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const closeButton = screen.getByRole('button', { name: 'Cerrar' });
    expect(closeButton).toBeInTheDocument();
    expect(closeButton.querySelector('svg')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('confirm button reads "Salvar" and renders a save icon', () => {
    render(
      <Wrapper>
        <CreateProductModal categories={[makeCategory()]} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const saveButton = screen.getByTestId('create-product-submit');
    expect(saveButton).toHaveTextContent('Salvar');
    expect(saveButton.querySelector('svg')).toBeTruthy();
  });

  it('footer buttons use the purple fab pill style (Angular mat-fab parity)', () => {
    render(
      <Wrapper>
        <CreateProductModal categories={[makeCategory()]} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: 'Cerrar' }).className).toContain('rounded-full');
    expect(screen.getByTestId('create-product-submit').className).toContain('rounded-full');
  });
});
