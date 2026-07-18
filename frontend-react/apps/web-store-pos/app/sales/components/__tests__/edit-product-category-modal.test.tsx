import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import { EditProductCategoryModal } from '../edit-product-category-modal';

// Text parity with Angular's edit-product-category-modal.component.html:11-28. Angular's
// ONLY validation on `order` is `required` -> GENERAL.VALIDATION.REQUIRED with GENERAL.ORDER
// ("Orden es requerido"). No positivity/min-value check exists in Angular — the React-only
// "Order must be a positive number" invented validation must be gone.
function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

describe('EditProductCategoryModal — validation text parity (GENERAL.VALIDATION.REQUIRED)', () => {
  it('shows "Nombre es requerido" when name is empty', () => {
    render(
      <Wrapper>
        <EditProductCategoryModal onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('category-name-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('category-save-button'));
    expect(screen.getByText('Nombre es requerido')).toBeInTheDocument();
  });

  it('shows "Orden es requerido" when order is cleared', () => {
    render(
      <Wrapper>
        <EditProductCategoryModal onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('category-name-input'), { target: { value: 'Bebidas' } });
    fireEvent.change(screen.getByTestId('category-order-input'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('category-save-button'));
    expect(screen.getByText('Orden es requerido')).toBeInTheDocument();
  });

  it('does NOT reject a negative order value — Angular has no positivity check, only required', () => {
    const onSave = vi.fn();
    render(
      <Wrapper>
        <EditProductCategoryModal onSave={onSave} onClose={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByTestId('category-name-input'), { target: { value: 'Bebidas' } });
    fireEvent.change(screen.getByTestId('category-order-input'), { target: { value: '-5' } });
    fireEvent.click(screen.getByTestId('category-save-button'));
    expect(screen.queryByTestId('category-order-input')).toBeInTheDocument();
    expect(screen.queryByText(/positive number/i)).not.toBeInTheDocument();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ order: -5 }));
  });

  it('renders the order field label as "Orden" (GENERAL.ORDER), not the hardcoded English "Order"', () => {
    render(
      <Wrapper>
        <EditProductCategoryModal onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Orden')).toBeInTheDocument();
    expect(screen.queryByText('Order')).not.toBeInTheDocument();
  });

  // Angular: edit-product-category-modal.component.html:26 —
  // <mat-slide-toggle formControlName="isActive">{{'GENERAL.ACTIVE'| translate}}</mat-slide-toggle>
  it('renders the active-checkbox label as "Activo" (GENERAL.ACTIVE), not the hardcoded English "Active"', () => {
    render(
      <Wrapper>
        <EditProductCategoryModal onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });
});

describe('EditProductCategoryModal — footer icons/labels parity', () => {
  it('close button reads "Cerrar" (not "Cancelar") and renders a close icon', () => {
    render(
      <Wrapper>
        <EditProductCategoryModal onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const closeButton = screen.getByRole('button', { name: 'Cerrar' });
    expect(closeButton).toBeInTheDocument();
    expect(closeButton.querySelector('svg')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('confirm button reads "Salvar" in create-mode and renders a save icon', () => {
    render(
      <Wrapper>
        <EditProductCategoryModal onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const saveButton = screen.getByTestId('category-save-button');
    expect(saveButton).toHaveTextContent('Salvar');
    expect(saveButton.querySelector('svg')).toBeTruthy();
  });

  it('confirm button reads "Actualizar" in edit-mode and renders a save icon', () => {
    render(
      <Wrapper>
        <EditProductCategoryModal
          category={{ id: 'cat-1', name: 'Bebidas', order: 1, isActive: true }}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      </Wrapper>,
    );
    const saveButton = screen.getByTestId('category-save-button');
    expect(saveButton).toHaveTextContent('Actualizar');
    expect(saveButton.querySelector('svg')).toBeTruthy();
  });
});
