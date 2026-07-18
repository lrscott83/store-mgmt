import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Product } from '@store-mgmt/domain';
import { EditProductsModal } from '../edit-products-modal';

// Footer-only parity test: bulk price-edit body is React-only (no Angular equivalent) and
// stays untouched — only the footer close/save button icons and close label are in scope.
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

describe('EditProductsModal — footer icons/labels parity', () => {
  it('close button reads "Cerrar" (not "Cancelar") and renders a close icon', () => {
    render(
      <Wrapper>
        <EditProductsModal products={[makeProduct()]} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const closeButton = screen.getByRole('button', { name: 'Cerrar' });
    expect(closeButton).toBeInTheDocument();
    expect(closeButton.querySelector('svg')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('confirm button keeps its label and renders a save icon', () => {
    render(
      <Wrapper>
        <EditProductsModal products={[makeProduct()]} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    const saveButton = screen.getByTestId('bulk-save-button');
    expect(saveButton).toHaveTextContent('Salvar');
    expect(saveButton.querySelector('svg')).toBeTruthy();
  });

  it('footer buttons use the purple fab pill style (Angular mat-fab parity)', () => {
    render(
      <Wrapper>
        <EditProductsModal products={[makeProduct()]} onSave={vi.fn()} onClose={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: 'Cerrar' }).className).toContain('rounded-full');
    expect(screen.getByTestId('bulk-save-button').className).toContain('rounded-full');
  });
});
