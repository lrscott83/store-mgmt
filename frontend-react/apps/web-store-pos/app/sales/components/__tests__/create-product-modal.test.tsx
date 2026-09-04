import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { ProductCategory } from '@store-mgmt/domain';
import { CreateProductModal } from '../create-product-modal';

// Scanner camera lib — mocked so opening the modal never loads the real @zxing/browser
// (lazy chunk) in jsdom; the manual-entry path needs no camera. Same pattern as
// sale.test.tsx.
vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
    decodeFromVideoDevice: vi.fn().mockRejectedValue(new Error('no camera in jsdom')),
  })),
}));

// Angular parity source: edit-product-modal.component.html (the ONE real modal, used for both
// create+edit). Fields top-to-bottom: Nombre, Precio, Código de barras, Orden, Activo,
// Disponible para Vender, Descuenta del Inventario. The barcode field is React-owned — Angular's
// commented-out control is legacy history. NO category dropdown (commented out in Angular).
// Category is pinned to click-context (single `category` prop), never user-editable.
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

  it('renders the Precio field without a currency prefix', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('product-price-prefix')).not.toBeInTheDocument();
  });

  it('renders the barcode input empty and the scan button beside it (React-owned field)', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByTestId('product-barcode-input')).toHaveValue('');
    expect(screen.getByTestId('product-barcode-scan')).toBeInTheDocument();
    // The scan button must never submit the host form — a barcode capture is not a save.
    expect(screen.getByTestId('product-barcode-scan')).toHaveAttribute('type', 'button');
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

describe('CreateProductModal — barcode field (React-owned, scanner-capturable)', () => {
  it('fills the barcode from typing and threads it into onSave as barcode', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Coca Cola' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByTestId('product-barcode-input'), { target: { value: '7501234567890' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Coca Cola', price: 1.5, barcode: '7501234567890' }),
    );
  });

  it('threads barcode=undefined when the barcode field is left empty', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Coca Cola' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ barcode: undefined }));
  });

  it('threads barcode=undefined when the barcode field is whitespace-only', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Coca Cola' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByTestId('product-barcode-input'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ barcode: undefined }));
  });

  it('opens the scanner when the scan button is clicked', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('scanner-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('product-barcode-scan'));
    expect(screen.getByTestId('scanner-modal')).toBeInTheDocument();
  });

  it('a manual scanner entry fills the barcode field AND closes the scanner (capture-once cadence)', () => {
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('product-barcode-scan'));
    fireEvent.change(screen.getByTestId('scanner-manual-input'), { target: { value: '7790561234567' } });
    fireEvent.click(screen.getByTestId('scanner-manual-submit'));

    expect(screen.getByTestId('product-barcode-input')).toHaveValue('7790561234567');
    expect(screen.queryByTestId('scanner-modal')).not.toBeInTheDocument();
  });

  it('a scanned barcode threads into onSave alongside the other form fields', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('product-barcode-scan'));
    fireEvent.change(screen.getByTestId('scanner-manual-input'), { target: { value: '7790561234567' } });
    fireEvent.click(screen.getByTestId('scanner-manual-submit'));

    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Coca Cola' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '1.5' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Coca Cola', price: 1.5, barcode: '7790561234567' }),
    );
  });
});

describe('CreateProductModal — price min(0) and order pattern parity (Angular formGroup validators)', () => {
  it('blocks submit and shows NUMBER_GREADER_THAN_ZERO when price is negative', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Coca Cola' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '-5' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Precio mínimo valor es 0')).toBeInTheDocument();
  });

  it('blocks submit with no message when order is a decimal (fails pattern /^[0-9]\\d*$/)', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Coca Cola' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByTestId('product-order-input'), { target: { value: '3.5' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText('Orden es requerido')).not.toBeInTheDocument();
  });

  it('blocks submit with no message when order is negative', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Coca Cola' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByTestId('product-order-input'), { target: { value: '-1' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText('Orden es requerido')).not.toBeInTheDocument();
  });

  it('submits normally when order is a valid non-negative integer', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <CreateProductModal category={makeCategory()} defaultOrder={1} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('product-name-input'), { target: { value: 'Coca Cola' } });
    fireEvent.change(screen.getByTestId('product-price-input'), { target: { value: '1.5' } });
    fireEvent.change(screen.getByTestId('product-order-input'), { target: { value: '9' } });
    fireEvent.click(screen.getByTestId('create-product-submit'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ order: 9 }));
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
