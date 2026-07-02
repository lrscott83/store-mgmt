import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { CategoryProductList } from '../category-product-list';

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
          category={makeCategory()}
          products={[]}
          onEditCategory={vi.fn()}
          onAddProduct={vi.fn()}
          onAddProducts={vi.fn()}
          onEditProduct={vi.fn()}
          onDeleteProduct={vi.fn()}
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
          category={makeCategory()}
          products={[makeProduct()]}
          onEditCategory={vi.fn()}
          onAddProduct={vi.fn()}
          onAddProducts={vi.fn()}
          onEditProduct={vi.fn()}
          onDeleteProduct={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.queryByText('No hay productos en esta categoría.')).not.toBeInTheDocument();
  });

  it('renders product name and formatted price', () => {
    render(
      <Wrapper>
        <CategoryProductList
          category={makeCategory()}
          products={[makeProduct({ name: 'Sprite', price: 2 })]}
          onEditCategory={vi.fn()}
          onAddProduct={vi.fn()}
          onAddProducts={vi.fn()}
          onEditProduct={vi.fn()}
          onDeleteProduct={vi.fn()}
        />
      </Wrapper>,
    );
    expect(screen.getByText('Sprite')).toBeInTheDocument();
    expect(screen.getByText('$2.00')).toBeInTheDocument();
  });

  it('renders the exact Angular action button labels: Categoría, Productos, Producto', () => {
    render(
      <Wrapper>
        <CategoryProductList
          category={makeCategory()}
          products={[]}
          onEditCategory={vi.fn()}
          onAddProduct={vi.fn()}
          onAddProducts={vi.fn()}
          onEditProduct={vi.fn()}
          onDeleteProduct={vi.fn()}
        />
      </Wrapper>,
    );
    // PRODUCT_CATEGORY.EDIT_CATEGORY = 'Categoría'
    expect(screen.getByTestId('edit-category-button')).toHaveTextContent('Categoría');
    // PRODUCT.NEW_PRODUCTS = 'Productos' (bulk add)
    expect(screen.getByTestId('add-products-button')).toHaveTextContent('Productos');
    // PRODUCT.NEW_PRODUCT = 'Producto' (single add)
    expect(screen.getByTestId('add-product-button')).toHaveTextContent('Producto');
  });

  it('calls onEditCategory when the "Categoría" action is clicked', () => {
    const onEditCategory = vi.fn();
    render(
      <Wrapper>
        <CategoryProductList
          category={makeCategory()}
          products={[]}
          onEditCategory={onEditCategory}
          onAddProduct={vi.fn()}
          onAddProducts={vi.fn()}
          onEditProduct={vi.fn()}
          onDeleteProduct={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('edit-category-button'));
    expect(onEditCategory).toHaveBeenCalledTimes(1);
  });

  it('calls onAddProducts (bulk) when the "Productos" action is clicked', () => {
    const onAddProducts = vi.fn();
    render(
      <Wrapper>
        <CategoryProductList
          category={makeCategory()}
          products={[]}
          onEditCategory={vi.fn()}
          onAddProduct={vi.fn()}
          onAddProducts={onAddProducts}
          onEditProduct={vi.fn()}
          onDeleteProduct={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('add-products-button'));
    expect(onAddProducts).toHaveBeenCalledTimes(1);
  });

  it('calls onAddProduct when the "Producto" action is clicked', () => {
    const onAddProduct = vi.fn();
    render(
      <Wrapper>
        <CategoryProductList
          category={makeCategory()}
          products={[]}
          onEditCategory={vi.fn()}
          onAddProduct={onAddProduct}
          onAddProducts={vi.fn()}
          onEditProduct={vi.fn()}
          onDeleteProduct={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('add-product-button'));
    expect(onAddProduct).toHaveBeenCalledTimes(1);
  });

  it('opens a per-product actions menu with "Editar Producto" / "Eliminar Producto"', () => {
    render(
      <Wrapper>
        <CategoryProductList
          category={makeCategory()}
          products={[makeProduct()]}
          onEditCategory={vi.fn()}
          onAddProduct={vi.fn()}
          onAddProducts={vi.fn()}
          onEditProduct={vi.fn()}
          onDeleteProduct={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText('Acciones'));
    // PRODUCT.EDIT_PRODUCT = 'Editar Producto', PRODUCT.DELETE_PRODUCT = 'Eliminar Producto'
    expect(screen.getByText('Editar Producto')).toBeInTheDocument();
    expect(screen.getByText('Eliminar Producto')).toBeInTheDocument();
  });

  it('calls onEditProduct with the product when "Editar Producto" is clicked', () => {
    const onEditProduct = vi.fn();
    const product = makeProduct();
    render(
      <Wrapper>
        <CategoryProductList
          category={makeCategory()}
          products={[product]}
          onEditCategory={vi.fn()}
          onAddProduct={vi.fn()}
          onAddProducts={vi.fn()}
          onEditProduct={onEditProduct}
          onDeleteProduct={vi.fn()}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText('Acciones'));
    fireEvent.click(screen.getByText('Editar Producto'));
    expect(onEditProduct).toHaveBeenCalledWith(product);
  });

  it('calls onDeleteProduct with the product id when "Eliminar Producto" is clicked', () => {
    const onDeleteProduct = vi.fn();
    const product = makeProduct();
    render(
      <Wrapper>
        <CategoryProductList
          category={makeCategory()}
          products={[product]}
          onEditCategory={vi.fn()}
          onAddProduct={vi.fn()}
          onAddProducts={vi.fn()}
          onEditProduct={vi.fn()}
          onDeleteProduct={onDeleteProduct}
        />
      </Wrapper>,
    );
    fireEvent.click(screen.getByLabelText('Acciones'));
    fireEvent.click(screen.getByText('Eliminar Producto'));
    expect(onDeleteProduct).toHaveBeenCalledWith(product.id);
  });
});
