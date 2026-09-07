import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Warehouse } from '@store-mgmt/domain';
import { WarehouseFormModal } from '../warehouse-form-modal';

const WAREHOUSE: Warehouse = {
  id: 'wh-1',
  name: 'Almacén Central',
  isActive: true,
  createdDate: new Date(),
  createdByName: 'jdoe',
};

function renderModal(props: Partial<Parameters<typeof WarehouseFormModal>[0]> = {}) {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <WarehouseFormModal
        open
        onClose={vi.fn()}
        onSave={vi.fn()}
        {...props}
      />
    </IntlProvider>,
  );
}

describe('WarehouseFormModal', () => {
  it('renders the create title and an empty input when no warehouse is passed', () => {
    renderModal();
    expect(screen.getByText('Nuevo almacén')).toBeTruthy();
    expect(screen.getByTestId('warehouse-name-input')).toBeTruthy();
    expect((screen.getByTestId('warehouse-name-input') as HTMLInputElement).value).toBe('');
  });

  it('renders the edit title prefilled with the warehouse name', () => {
    renderModal({ warehouse: WAREHOUSE });
    expect(screen.getByText('Editar almacén')).toBeTruthy();
    const input = screen.getByTestId('warehouse-name-input') as HTMLInputElement;
    expect(input.value).toBe('Almacén Central');
  });

  it('disables Save when the name is empty or whitespace-only', () => {
    renderModal();
    const save = screen.getByText('Guardar');
    expect((save as HTMLButtonElement).disabled).toBe(true);

    const input = screen.getByTestId('warehouse-name-input');
    fireEvent.change(input, { target: { value: '   ' } });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'Sucursal' } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
  });

  it('calls onSave with the trimmed name and does not close by itself', () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    renderModal({ onSave, onClose });
    fireEvent.change(screen.getByTestId('warehouse-name-input'), { target: { value: '  Norte  ' } });
    fireEvent.click(screen.getByText('Guardar'));
    expect(onSave).toHaveBeenCalledWith('Norte');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose on Cancel and on backdrop click', () => {
    const onClose = vi.fn();
    const { container } = renderModal({ onClose });
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelector('[role="dialog"]')!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
