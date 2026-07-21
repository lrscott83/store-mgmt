import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { EditProductsModal } from '../edit-products-modal';

// Angular reference: edit-products-modal.component.ts/.html (frontend/src/app/presentation/
// products/edit-products-modal/). This modal is a bulk-CREATE form (4 blank Nombre/Precio
// rows + "+ Nuevo" add-row), NOT a bulk price-edit of existing products.

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

function nameInput(index: number) {
  return screen.getByTestId(`product-name-${index}`);
}

function priceInput(index: number) {
  return screen.getByTestId(`product-price-${index}`);
}

describe('EditProductsModal — opens with 4 blank rows (Angular parity: constructor loops addProduct() x4)', () => {
  it('renders exactly 4 blank Nombre/Precio rows, no pre-filled data', () => {
    render(
      <Wrapper>
        <EditProductsModal categoryId="cat-1" onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    for (let i = 0; i < 4; i++) {
      expect(nameInput(i)).toHaveValue('');
      expect(priceInput(i)).toHaveValue(null);
    }
    expect(screen.queryByTestId('product-name-4')).not.toBeInTheDocument();
  });

  it('renders the modal title (PRODUCT.ADD_PRODUCTS)', () => {
    render(
      <Wrapper>
        <EditProductsModal categoryId="cat-1" onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Adicionar Productos')).toBeInTheDocument();
  });
});

describe('EditProductsModal — "+ Nuevo" add-row button (Angular parity: addProduct())', () => {
  it('appends a new blank row when clicked', () => {
    render(
      <Wrapper>
        <EditProductsModal categoryId="cat-1" onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.queryByTestId('product-name-4')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-product-row-button'));
    expect(nameInput(4)).toHaveValue('');
    expect(priceInput(4)).toHaveValue(null);
  });

  it('renders the GENERAL.NEW label with an add icon', () => {
    render(
      <Wrapper>
        <EditProductsModal categoryId="cat-1" onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const addButton = screen.getByTestId('add-product-row-button');
    expect(addButton).toHaveTextContent('Nuevo');
    expect(addButton.querySelector('svg')).toBeTruthy();
  });
});

describe('EditProductsModal — required-name validation (Angular parity: Validators.required)', () => {
  it('shows a per-row required error and does not call onSave when a partially-filled row has no name', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductsModal categoryId="cat-1" onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    // Row 0: price entered but name left blank -> "partial" row, must be valid to submit.
    fireEvent.change(priceInput(0), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('bulk-save-button'));

    expect(screen.getByText('Nombre es requerido')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not show any error for the other 3 completely blank rows (Angular: only partial rows are touched)', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductsModal categoryId="cat-1" onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(priceInput(0), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('bulk-save-button'));

    // Only 1 required-name error total (row 0) — the other 3 blank rows stay silent.
    expect(screen.getAllByText('Nombre es requerido')).toHaveLength(1);
  });
});

describe('EditProductsModal — duplicate-name validation (Angular parity: hasDuplicateNames, NO visible message)', () => {
  it('blocks submit silently when two rows share the same trimmed, case-insensitive name', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductsModal categoryId="cat-1" onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(nameInput(0), { target: { value: 'Coca Cola' } });
    fireEvent.change(priceInput(0), { target: { value: '1.50' } });
    fireEvent.change(nameInput(1), { target: { value: ' coca cola ' } });
    fireEvent.change(priceInput(1), { target: { value: '2.00' } });

    fireEvent.click(screen.getByTestId('bulk-save-button'));

    expect(onSave).not.toHaveBeenCalled();
    // Angular's own duplicate-name Swal dialog is dead/commented-out code — no message here.
    expect(screen.queryByText(/duplicad/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('EditProductsModal — submit calls createProducts with only fully-filled rows (Angular parity)', () => {
  it('calls onSave(categoryId, items) with only rows where BOTH name and price are filled', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductsModal categoryId="cat-42" onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(nameInput(0), { target: { value: 'Coca Cola' } });
    fireEvent.change(priceInput(0), { target: { value: '1.50' } });
    fireEvent.change(nameInput(1), { target: { value: 'Pepsi' } });
    fireEvent.change(priceInput(1), { target: { value: '2' } });
    // Rows 2 and 3 stay fully blank — must be excluded from the submitted items.

    fireEvent.click(screen.getByTestId('bulk-save-button'));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('cat-42', [
      { name: 'Coca Cola', price: 1.5 },
      { name: 'Pepsi', price: 2 },
    ]);
  });

  it('blocks submit and shows an invalid-price error when price format/greater-than-zero fails', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductsModal categoryId="cat-1" onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(nameInput(0), { target: { value: 'Coca Cola' } });
    fireEvent.change(priceInput(0), { target: { value: '0' } });

    fireEvent.click(screen.getByTestId('bulk-save-button'));

    expect(screen.getByText('Precio inválido')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('EditProductsModal — footer icons/labels parity (Angular mat-fab extended)', () => {
  it('close button reads "Cerrar" and renders a close icon', () => {
    render(
      <Wrapper>
        <EditProductsModal categoryId="cat-1" onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const closeButton = screen.getByRole('button', { name: 'Cerrar' });
    expect(closeButton).toBeInTheDocument();
    expect(closeButton.querySelector('svg')).toBeTruthy();
  });

  it('confirm button keeps its label and renders a save icon', () => {
    render(
      <Wrapper>
        <EditProductsModal categoryId="cat-1" onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const saveButton = screen.getByTestId('bulk-save-button');
    expect(saveButton).toHaveTextContent('Salvar');
    expect(saveButton.querySelector('svg')).toBeTruthy();
  });

  it('footer buttons use the purple fab pill style (Angular mat-fab parity)', () => {
    render(
      <Wrapper>
        <EditProductsModal categoryId="cat-1" onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: 'Cerrar' }).className).toContain('rounded-full');
    expect(screen.getByTestId('bulk-save-button').className).toContain('rounded-full');
  });
});
