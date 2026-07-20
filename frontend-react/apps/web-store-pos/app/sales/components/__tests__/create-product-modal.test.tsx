import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { ProductCategory } from '@store-mgmt/domain';
import { CreateProductModal } from '../create-product-modal';

// Angular parity source: edit-product-modal.component.html (the ONE real modal, used for both
// create+edit). Fields top-to-bottom: Nombre, Precio ($ prefix), Orden, Activo, Disponible para
// Vender, Descuenta del Inventario. NO barcode input, NO category dropdown (both commented out
// in Angular). Category is pinned to click-context (single `category` prop), never user-editable.
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

describe('CreateProductModal — name field autofocus', () => {
  it('focuses the name input on mount', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByTestId('product-name-input')).toHaveFocus();
  });
});

describe('CreateProductModal — validation text parity (GENERAL.VALIDATION.REQUIRED)', () => {
  it('shows "Nombre es requerido" when name is empty', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('create-product-submit'));
    expect(screen.getByText('Nombre es requerido')).toBeInTheDocument();
  });

  it('shows "Precio es requerido" when price is empty', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Coca Cola' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));
    expect(screen.getByText('Precio es requerido')).toBeInTheDocument();
  });

  it('shows "Orden es requerido" when order is cleared', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Coca Cola' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByTestId('product-order-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));
    expect(screen.getByText('Orden es requerido')).toBeInTheDocument();
  });
});

describe('CreateProductModal — Angular field set/order parity', () => {
  it('prefills Orden with defaultOrder and checks all 3 toggles by default', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={5} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByTestId('product-order-input')).toHaveValue(5);
    expect(screen.getByTestId('product-active-checkbox')).toBeChecked();
    expect(screen.getByTestId('product-available-checkbox')).toBeChecked();
    expect(screen.getByTestId('product-discount-checkbox')).toBeChecked();
  });

  it('renders a "$" prefix on the Precio field', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByTestId('product-price-prefix')).toHaveTextContent('$');
  });

  it('does not render a barcode input', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('product-barcode-input')).not.toBeInTheDocument();
  });

  it('does not render a category dropdown', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('product-category-select')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('title resolves PRODUCT.NEW_PRODUCT ("Producto")', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByRole('heading', { name: 'Producto' })).toBeInTheDocument();
  });

  it('inventory-discount checkbox label reads exactly "Descuenta del Inventario"', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Descuenta del Inventario')).toBeInTheDocument();
  });

  it('submits categoryId=category.id, order, isActive, availableToSale, discountFromInvantory, barcode=undefined', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory({ id: 'cat-2' })} defaultOrder={3} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Sprite' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));

    expect(onSave).toHaveBeenCalledWith({
      name: 'Sprite',
      price: 2.5,
      barcode: undefined,
      categoryId: 'cat-2',
      order: 3,
      isActive: true,
      availableToSale: true,
      discountFromInvantory: true,
    });
  });
});

describe('CreateProductModal — footer icons/labels parity', () => {
  it('close button reads "Cerrar" (not "Cancelar") and renders a close icon', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
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
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const saveButton = screen.getByTestId('create-product-submit');
    expect(saveButton).toHaveTextContent('Salvar');
    expect(saveButton.querySelector('svg')).toBeTruthy();
  });

  it('footer buttons use the purple fab pill style (Angular mat-fab parity)', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: 'Cerrar' }).className).toContain('rounded-full');
    expect(screen.getByTestId('create-product-submit').className).toContain('rounded-full');
  });
});
