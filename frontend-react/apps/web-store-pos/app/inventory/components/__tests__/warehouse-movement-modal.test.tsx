import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Product, Warehouse } from '@store-mgmt/domain';
import { WarehouseMovementModal, type WarehouseMovementMode } from '../warehouse-movement-modal';

const WAREHOUSE: Warehouse = {
  id: 'wh-1',
  name: 'Almacén Central',
  isActive: true,
  createdDate: new Date(),
  createdByName: 'jdoe',
};

const TARGET: Warehouse = {
  id: 'wh-2',
  name: 'Sucursal Norte',
  isActive: true,
  createdDate: new Date(),
  createdByName: 'jdoe',
};

const PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    name: 'Café',
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 1000,
    order: 1,
    isActive: true,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'b-1',
    createdDate: new Date(),
    createdByName: 'jdoe',
  },
  {
    id: 'prod-2',
    name: 'Azúcar',
    categoryId: 'cat-1',
    categoryName: 'Bebidas',
    price: 500,
    order: 2,
    isActive: true,
    availableToSale: true,
    discountFromInvantory: false,
    businessId: 'b-1',
    createdDate: new Date(),
    createdByName: 'jdoe',
  },
];

function renderModal(props: Partial<Parameters<typeof WarehouseMovementModal>[0]> = {}) {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <WarehouseMovementModal
        open
        mode="purchase_in"
        warehouse={WAREHOUSE}
        targetWarehouses={[TARGET]}
        products={PRODUCTS}
        productId={null}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        {...props}
      />
    </IntlProvider>,
  );
}

function fillValidForm() {
  selectProductByName('Café');
  fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '10' } });
  fireEvent.change(screen.getByTestId('movement-cost'), { target: { value: '660' } });
}

/** Escribe en el combobox y elige la opción filtrada, como haría el usuario. */
function selectProductByName(name: string) {
  fireEvent.change(screen.getByTestId('movement-product'), { target: { value: name } });
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('WarehouseMovementModal', () => {
  it('renders the title per mode with the warehouse name', () => {
    const modes: Array<[WarehouseMovementMode, string]> = [
      ['purchase_in', 'Entrada al almacén — Almacén Central'],
      ['transfer_out', 'Movimiento a otro almacén — Almacén Central'],
      ['sale_out', 'Salida a tienda — Almacén Central'],
    ];
    for (const [mode, title] of modes) {
      const { unmount } = renderModal({ mode });
      expect(screen.getByText(title)).toBeTruthy();
      unmount();
    }
  });

  it('enables the product searchable combobox when opened from the gear', () => {
    renderModal({ productId: null });
    const input = screen.getByTestId('movement-product') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(input.getAttribute('role')).toBe('combobox');
  });

  it('disables the product combobox and preselects its name when opened from a row', () => {
    renderModal({ productId: 'prod-1' });
    const input = screen.getByTestId('movement-product') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.value).toBe('Café');
  });

  it('disables Save until product + quantity are valid (cost required for purchase_in)', () => {
    renderModal({ mode: 'purchase_in' });
    const save = screen.getByText('Guardar');
    expect((save as HTMLButtonElement).disabled).toBe(true);

    selectProductByName('Café');
    expect((save as HTMLButtonElement).disabled).toBe(true); // sin cantidad

    fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '10' } });
    expect((save as HTMLButtonElement).disabled).toBe(true); // sin costo (purchase_in)

    fireEvent.change(screen.getByTestId('movement-cost'), { target: { value: '660' } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not require cost for sale_out', () => {
    renderModal({ mode: 'sale_out', productId: 'prod-1' });
    fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '5' } });
    expect((screen.getByText('Guardar') as HTMLButtonElement).disabled).toBe(false);
  });

  it('requires a target warehouse for transfer_out', () => {
    renderModal({ mode: 'transfer_out', productId: 'prod-1' });
    fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '5' } });
    expect((screen.getByText('Guardar') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId('movement-target'), { target: { value: 'wh-2' } });
    expect((screen.getByText('Guardar') as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls onSubmit with the expected fields and does not close by itself', () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    renderModal({ onSubmit, onClose });
    fillValidForm();
    fireEvent.change(screen.getByTestId('movement-reason'), {
      target: { value: '  reposición  ' },
    });
    fireEvent.click(screen.getByText('Guardar'));

    expect(onSubmit).toHaveBeenCalledWith({
      productId: 'prod-1',
      quantity: 10,
      costPrice: 660,
      toWarehouseId: undefined,
      reason: 'reposición',
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('passes toWarehouseId only for transfer_out', () => {
    const onSubmit = vi.fn();
    renderModal({ mode: 'transfer_out', productId: 'prod-1', onSubmit });
    fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('movement-target'), { target: { value: 'wh-2' } });
    fireEvent.click(screen.getByText('Guardar'));

    expect(onSubmit).toHaveBeenCalledWith({
      productId: 'prod-1',
      quantity: 5,
      costPrice: undefined,
      toWarehouseId: 'wh-2',
      reason: null,
    });
  });

  it('calls onClose on Cancel and on backdrop click', () => {
    const onClose = vi.fn();
    const { container } = renderModal({ onClose });
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelector('[role="dialog"]')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('shows the searchable combobox only from the gear (read-only from a row)', () => {
    const { unmount } = renderModal({ productId: null });
    // Desde el gear: el combobox abre su listbox al escribir.
    fireEvent.change(screen.getByTestId('movement-product'), { target: { value: 'ca' } });
    expect(screen.getByRole('listbox')).toBeTruthy();
    unmount();

    renderModal({ productId: 'prod-1' });
    // Desde la fila: sin búsqueda, el nombre precargado queda en un input deshabilitado.
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('filters product options while typing in the combobox', () => {
    renderModal({ productId: null });
    const input = screen.getByTestId('movement-product') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'azuc' } });
    expect(Array.from(screen.getAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Azúcar',
    ]);

    fireEvent.change(input, { target: { value: 'cafe' } });
    expect(Array.from(screen.getAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Café',
    ]);
  });

  it('matches accents case-insensitively (CAFÉ via "cafe")', () => {
    renderModal({ productId: null });
    fireEvent.change(screen.getByTestId('movement-product'), { target: { value: 'CAF' } });
    expect(Array.from(screen.getAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Café',
    ]);
  });

  it('selects a filtered product and submits its id', () => {
    const onSubmit = vi.fn();
    renderModal({ onSubmit, productId: null });
    selectProductByName('Azúcar');
    fireEvent.change(screen.getByTestId('movement-quantity'), { target: { value: '3' } });
    fireEvent.change(screen.getByTestId('movement-cost'), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Guardar'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'prod-2', quantity: 3 }),
    );
  });
});
