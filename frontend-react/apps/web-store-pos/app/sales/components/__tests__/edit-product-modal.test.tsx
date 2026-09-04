import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Product } from '@store-mgmt/domain';
import { EditProductModal } from '../edit-product-modal';

// Scanner camera lib — mocked so opening the modal never loads the real @zxing/browser
// (lazy chunk) in jsdom; the manual-entry path needs no camera. Same pattern as
// sale.test.tsx.
vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
    decodeFromVideoDevice: vi.fn().mockRejectedValue(new Error('no camera in jsdom')),
  })),
}));

// Angular parity source: edit-product-modal.component.html — same field set/order as create:
// Nombre, Precio, Código de barras, Orden, Activo, Disponible para Vender, Descuenta del
// Inventario. The barcode field is React-owned (prefilled with the stored barcode) — Angular's
// commented-out control is legacy history. NO category dropdown, NO in-modal delete (delete
// lives at list-row level). categoryId stays pinned to product.categoryId — never user-editable.
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Coca Cola',
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 1.5,
    order: 1,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'biz-1',
    isActive: true,
    createdDate: new Date('2025-01-01'),
    createdByName: 'test',
    ...overrides,
  };
}

describe('EditProductModal — name field autofocus', () => {
  it('focuses the name input on mount', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByTestId('edit-product-name-input')).toHaveFocus();
  });
});

describe('EditProductModal — validation text parity (GENERAL.VALIDATION.REQUIRED)', () => {
  it('shows "Nombre es requerido" when name is cleared', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-product-name-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('edit-product-submit'));
    expect(screen.getByText('Nombre es requerido')).toBeInTheDocument();
  });

  it('shows "Precio es requerido" when price is cleared', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-product-price-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('edit-product-submit'));
    expect(screen.getByText('Precio es requerido')).toBeInTheDocument();
  });

  it('shows "Orden es requerido" when order is cleared', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-product-order-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('edit-product-submit'));
    expect(screen.getByText('Orden es requerido')).toBeInTheDocument();
  });
});

describe('EditProductModal — Angular field set/order parity', () => {
  it('prefills Orden=product.order and Activo=product.isActive', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct({ order: 7, isActive: false })} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByTestId('edit-product-order-input')).toHaveValue(7);
    expect(screen.getByTestId('edit-product-active-checkbox')).not.toBeChecked();
  });

  it('renders the Precio field without a currency prefix', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('edit-product-price-prefix')).not.toBeInTheDocument();
  });

  it('prefills the barcode input with the stored barcode and renders the scan button beside it', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct({ barcode: '7501234567890' })} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByTestId('edit-product-barcode-input')).toHaveValue('7501234567890');
    expect(screen.getByTestId('edit-product-barcode-scan')).toBeInTheDocument();
    // The scan button must never submit the host form — a barcode capture is not a save.
    expect(screen.getByTestId('edit-product-barcode-scan')).toHaveAttribute('type', 'button');
  });

  it('prefills the barcode input empty when the product has no stored barcode', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct({ barcode: undefined })} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByTestId('edit-product-barcode-input')).toHaveValue('');
  });

  it('does not render a category dropdown', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('title resolves PRODUCT.EDIT_PRODUCT ("Editar Producto")', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByRole('heading', { name: 'Editar Producto' })).toBeInTheDocument();
  });

  it('does not render delete UI (delete-product-button/confirm-delete-button)', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('delete-product-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('confirm-delete-button')).not.toBeInTheDocument();
  });

  it('submit keeps categoryId pinned to product.categoryId', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductModal product={makeProduct({ categoryId: 'cat-9' })} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('edit-product-submit'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ categoryId: 'cat-9' }));
  });
});

describe('EditProductModal — price min(0) and order pattern parity (Angular formGroup validators)', () => {
  it('blocks submit and shows NUMBER_GREADER_THAN_ZERO when price is negative', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-product-price-input'), { target: { value: '-5' } });
    fireEvent.click(screen.getByTestId('edit-product-submit'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Precio mínimo valor es 0')).toBeInTheDocument();
  });

  it('blocks submit with no message when order is a decimal (fails pattern /^[0-9]\\d*$/)', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-product-order-input'), { target: { value: '3.5' } });
    fireEvent.click(screen.getByTestId('edit-product-submit'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText('Orden es requerido')).not.toBeInTheDocument();
  });

  it('blocks submit with no message when order is negative', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-product-order-input'), { target: { value: '-1' } });
    fireEvent.click(screen.getByTestId('edit-product-submit'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByText('Orden es requerido')).not.toBeInTheDocument();
  });

  it('submits normally when order is a valid non-negative integer', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-product-order-input'), { target: { value: '9' } });
    fireEvent.click(screen.getByTestId('edit-product-submit'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ order: 9 }));
  });
});

describe('EditProductModal — footer icons/labels parity', () => {
  it('close button reads "Cerrar" (not "Cancelar") and renders a close icon', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const saveButton = screen.getByTestId('edit-product-submit');
    const closeButton = saveButton.parentElement?.querySelector('button:first-child');
    expect(closeButton).toHaveTextContent('Cerrar');
    expect(closeButton?.querySelector('svg')).toBeTruthy();
  });

  it('confirm button reads "Actualizar" (GENERAL.UPDATE) and renders a save icon', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const saveButton = screen.getByTestId('edit-product-submit');
    expect(saveButton).toHaveTextContent('Actualizar');
    expect(saveButton.querySelector('svg')).toBeTruthy();
  });

  it('main footer buttons use the purple fab pill style (Angular mat-fab parity)', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const saveButton = screen.getByTestId('edit-product-submit');
    const closeButton = saveButton.parentElement?.querySelector('button:first-child') as HTMLElement;
    expect(saveButton.className).toContain('rounded-full');
    expect(closeButton.className).toContain('rounded-full');
  });
});

describe('EditProductModal — barcode field (React-owned, scanner-capturable)', () => {
  it('threads the stored barcode into onSave when saved without touching the field', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductModal product={makeProduct({ barcode: '7501234567890' })} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('edit-product-submit'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ barcode: '7501234567890' }));
  });

  it('threads barcode=undefined when the stored barcode is cleared', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductModal product={makeProduct({ barcode: '7501234567890' })} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-product-barcode-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('edit-product-submit'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ barcode: undefined }));
  });

  it('threads a typed barcode edit into onSave', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductModal product={makeProduct({ barcode: '111' })} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('edit-product-barcode-input'), { target: { value: '7790561234567' } });
    fireEvent.click(screen.getByTestId('edit-product-submit'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ barcode: '7790561234567' }));
  });

  it('opens the scanner when the scan button is clicked', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct()} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('scanner-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('edit-product-barcode-scan'));
    expect(screen.getByTestId('scanner-modal')).toBeInTheDocument();
  });

  it('a manual scanner entry replaces the barcode field AND closes the scanner (capture-once cadence)', () => {
    render(
      <Wrapper>
        <EditProductModal product={makeProduct({ barcode: '111' })} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('edit-product-barcode-scan'));
    fireEvent.change(screen.getByTestId('scanner-manual-input'), { target: { value: '7790561234567' } });
    fireEvent.click(screen.getByTestId('scanner-manual-submit'));

    expect(screen.getByTestId('edit-product-barcode-input')).toHaveValue('7790561234567');
    expect(screen.queryByTestId('scanner-modal')).not.toBeInTheDocument();
  });

  it('a scanned barcode overrides the stored barcode in onSave', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductModal product={makeProduct({ barcode: '111' })} onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('edit-product-barcode-scan'));
    fireEvent.change(screen.getByTestId('scanner-manual-input'), { target: { value: '7790561234567' } });
    fireEvent.click(screen.getByTestId('scanner-manual-submit'));

    fireEvent.change(screen.getByTestId('edit-product-name-input'), { target: { value: 'Coca Cola Zero' } });
    fireEvent.click(screen.getByTestId('edit-product-submit'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Coca Cola Zero', barcode: '7790561234567' }),
    );
  });
});
