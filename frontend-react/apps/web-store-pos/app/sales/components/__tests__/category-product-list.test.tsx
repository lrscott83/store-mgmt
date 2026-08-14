import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Product } from '@store-mgmt/domain';
import { CategoryProductList } from '../category-product-list';

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

describe('CategoryProductList — per-category product panel (Angular parity)', () => {
  it('shows the per-category empty state when the category has no products', () => {
    render(
      <Wrapper>
        <CategoryProductList
          products={[]}
          onEditProduct={vi.fn()}
          onDeactivateProduct={vi.fn()}
          onActivateProduct={vi.fn()}
        />
      </Wrapper>,
    );
    // PRODUCT_CATEGORY.NO_PRODUCT_FOUND
    expect(screen.getByText('No hay productos en esta categoría.')).toBeInTheDocument();
  });

  it('does not show the empty state when the category has products', () => {
    render(
      <Wrapper>
        <CategoryProductList
          products={[makeProduct()]}
          onEditProduct={vi.fn()}
          onDeactivateProduct={vi.fn()}
          onActivateProduct={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.queryByText('No hay productos en esta categoría.')).not.toBeInTheDocument();
  });

  it('renders product name and formatted price', () => {
    render(
      <Wrapper>
        <CategoryProductList
          products={[makeProduct({ name: 'Sprite', price: 2 })]}
          onEditProduct={vi.fn()}
          onDeactivateProduct={vi.fn()}
          onActivateProduct={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByText('Sprite')).toBeInTheDocument();
    expect(screen.getByText('$2.00')).toBeInTheDocument();
  });

  it('formats the price with a thousands separator via formatCurrency (WU7 list-parity sweep)', () => {
    render(
      <Wrapper>
        <CategoryProductList
          products={[makeProduct({ name: 'Sprite', price: 2000 })]}
          onEditProduct={vi.fn()}
          onDeactivateProduct={vi.fn()}
          onActivateProduct={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByText('$2,000.00')).toBeInTheDocument();
  });

  it('opens a per-product actions menu with "Editar Producto" / "Desactivar Producto"', () => {
    render(
      <Wrapper>
        <CategoryProductList
          products={[makeProduct()]}
          onEditProduct={vi.fn()}
          onDeactivateProduct={vi.fn()}
          onActivateProduct={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText('Acciones'));
    // PRODUCT.EDIT_PRODUCT = 'Editar Producto', PRODUCT.DEACTIVATE_PRODUCT = 'Desactivar Producto'
    expect(screen.getByText('Editar Producto')).toBeInTheDocument();
    expect(screen.getByText('Desactivar Producto')).toBeInTheDocument();
  });

  it('renders "Editar Producto" with a primary-colored edit icon and "Desactivar Producto" with a danger-colored icon', () => {
    render(
      <Wrapper>
        <CategoryProductList
          products={[makeProduct()]}
          onEditProduct={vi.fn()}
          onDeactivateProduct={vi.fn()}
          onActivateProduct={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText('Acciones'));
    const editButton = screen.getByText('Editar Producto').closest('button');
    const deactivateButton = screen.getByText('Desactivar Producto').closest('button');
    expect(editButton).toHaveClass('text-primary');
    expect(editButton?.querySelector('svg')).toBeTruthy();
    expect(deactivateButton).toHaveClass('text-danger');
    expect(deactivateButton?.querySelector('svg')).toBeTruthy();
  });

  it('S-GM-PRODUCT-ROW-1: a separator precedes "Desactivar Producto"', () => {
    render(
      <Wrapper>
        <CategoryProductList
          products={[makeProduct()]}
          onEditProduct={vi.fn()}
          onDeactivateProduct={vi.fn()}
          onActivateProduct={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText('Acciones'));
    const deactivateButton = screen.getByText('Desactivar Producto').closest('button');
    expect(deactivateButton?.previousElementSibling).toHaveAttribute('role', 'separator');
  });

  it('calls onEditProduct with the product when "Editar Producto" is clicked', () => {
    const onEditProduct = vi.fn();
    const product = makeProduct();
    render(
      <Wrapper>
        <CategoryProductList
          products={[product]}
          onEditProduct={onEditProduct}
          onDeactivateProduct={vi.fn()}
          onActivateProduct={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText('Acciones'));
    fireEvent.click(screen.getByText('Editar Producto'));
    expect(onEditProduct).toHaveBeenCalledWith(product);
  });

  it('calls onDeactivateProduct with the product id when "Desactivar Producto" is clicked', () => {
    const onDeactivateProduct = vi.fn();
    const product = makeProduct();
    render(
      <Wrapper>
        <CategoryProductList
          products={[product]}
          onEditProduct={vi.fn()}
          onDeactivateProduct={onDeactivateProduct}
          onActivateProduct={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText('Acciones'));
    fireEvent.click(screen.getByText('Desactivar Producto'));
    expect(onDeactivateProduct).toHaveBeenCalledWith(product.id);
  });

  it('marks an inactive product with the Inactivo badge', () => {
    render(
      <Wrapper>
        <CategoryProductList
          products={[makeProduct({ id: 'p1', name: 'Sprite', isActive: false })]}
          onEditProduct={vi.fn()}
          onDeactivateProduct={vi.fn()}
          onActivateProduct={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByText('Sprite')).toBeInTheDocument();
    expect(screen.getByTestId('inactive-badge')).toHaveTextContent('Inactivo');
  });

  it('does not mark an active product', () => {
    render(
      <Wrapper>
        <CategoryProductList
          products={[makeProduct({ id: 'p1', name: 'Coca Cola', isActive: true })]}
          onEditProduct={vi.fn()}
          onDeactivateProduct={vi.fn()}
          onActivateProduct={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.queryByTestId('inactive-badge')).not.toBeInTheDocument();
  });

  it('offers "Activar Producto" (not "Desactivar Producto") in the menu for an inactive product', () => {
    render(
      <Wrapper>
        <CategoryProductList
          products={[makeProduct({ id: 'p1', name: 'Sprite', isActive: false })]}
          onEditProduct={vi.fn()}
          onDeactivateProduct={vi.fn()}
          onActivateProduct={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText('Acciones'));
    expect(screen.getByText('Activar Producto')).toBeInTheDocument();
    expect(screen.queryByText('Desactivar Producto')).not.toBeInTheDocument();
  });

  it('renders "Activar Producto" with a success-colored check icon for an inactive product', () => {
    render(
      <Wrapper>
        <CategoryProductList
          products={[makeProduct({ id: 'p1', name: 'Sprite', isActive: false })]}
          onEditProduct={vi.fn()}
          onDeactivateProduct={vi.fn()}
          onActivateProduct={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText('Acciones'));
    const activateButton = screen.getByText('Activar Producto').closest('button');
    expect(activateButton).toHaveClass('text-success');
    expect(activateButton?.querySelector('svg')).toBeTruthy();
  });

  it('calls onActivateProduct with the product when "Activar Producto" is clicked', () => {
    const onActivateProduct = vi.fn();
    const product = makeProduct({ id: 'p1', name: 'Sprite', isActive: false });
    render(
      <Wrapper>
        <CategoryProductList
          products={[product]}
          onEditProduct={vi.fn()}
          onDeactivateProduct={vi.fn()}
          onActivateProduct={onActivateProduct}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText('Acciones'));
    fireEvent.click(screen.getByText('Activar Producto'));
    expect(onActivateProduct).toHaveBeenCalledWith(product);
  });
});
