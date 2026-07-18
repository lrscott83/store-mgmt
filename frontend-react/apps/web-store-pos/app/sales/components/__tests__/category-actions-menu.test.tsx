import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { ProductCategory } from '@store-mgmt/domain';
import { CategoryActionsMenu } from '../category-actions-menu';

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

function renderMenu(handlers: Partial<{
  onEditCategory: () => void;
  onAddProduct: () => void;
  onAddProducts: () => void;
}> = {}) {
  render(
    <Wrapper>
      <CategoryActionsMenu
        category={makeCategory()}
        onEditCategory={handlers.onEditCategory ?? vi.fn()}
        onAddProduct={handlers.onAddProduct ?? vi.fn()}
        onAddProducts={handlers.onAddProducts ?? vi.fn()}
      />
    </Wrapper>,
  );
}

describe('CategoryActionsMenu — gear menu for category actions', () => {
  it('renders a gear toggle and keeps the menu closed initially', () => {
    renderMenu();
    expect(screen.getByTestId('category-actions-toggle-cat-1')).toBeInTheDocument();
    // Actions are hidden until the gear is opened
    expect(screen.queryByTestId('edit-category-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-product-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('add-products-button')).not.toBeInTheDocument();
  });

  it('opens the menu with the three category actions when the gear is clicked', () => {
    renderMenu();
    fireEvent.click(screen.getByTestId('category-actions-toggle-cat-1'));
    expect(screen.getByTestId('edit-category-button')).toBeInTheDocument();
    expect(screen.getByTestId('add-product-button')).toBeInTheDocument();
    expect(screen.getByTestId('add-products-button')).toBeInTheDocument();
  });

  it('renders items in Angular order (Categoría, Productos bulk, Producto single) each with an icon', () => {
    renderMenu();
    fireEvent.click(screen.getByTestId('category-actions-toggle-cat-1'));
    const editButton = screen.getByTestId('edit-category-button');
    const addProductsButton = screen.getByTestId('add-products-button');
    const addProductButton = screen.getByTestId('add-product-button');

    // DOM order: edit-category-button -> add-products-button (bulk) -> add-product-button (single)
    const position = editButton.compareDocumentPosition(addProductsButton);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const position2 = addProductsButton.compareDocumentPosition(addProductButton);
    expect(position2 & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(editButton.querySelector('svg')).toBeTruthy();
    expect(addProductsButton.querySelector('svg')).toBeTruthy();
    expect(addProductButton.querySelector('svg')).toBeTruthy();
  });

  it('S-GM-CAT-ACTIONS-1: all three items are text-primary and no separator is present', () => {
    renderMenu();
    fireEvent.click(screen.getByTestId('category-actions-toggle-cat-1'));
    expect(screen.getByTestId('edit-category-button')).toHaveClass('text-primary');
    expect(screen.getByTestId('add-products-button')).toHaveClass('text-primary');
    expect(screen.getByTestId('add-product-button')).toHaveClass('text-primary');
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('calls onEditCategory and closes the menu', () => {
    const onEditCategory = vi.fn();
    renderMenu({ onEditCategory });
    fireEvent.click(screen.getByTestId('category-actions-toggle-cat-1'));
    fireEvent.click(screen.getByTestId('edit-category-button'));
    expect(onEditCategory).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('edit-category-button')).not.toBeInTheDocument();
  });

  it('calls onAddProduct (single)', () => {
    const onAddProduct = vi.fn();
    renderMenu({ onAddProduct });
    fireEvent.click(screen.getByTestId('category-actions-toggle-cat-1'));
    fireEvent.click(screen.getByTestId('add-product-button'));
    expect(onAddProduct).toHaveBeenCalledTimes(1);
  });

  it('calls onAddProducts (bulk)', () => {
    const onAddProducts = vi.fn();
    renderMenu({ onAddProducts });
    fireEvent.click(screen.getByTestId('category-actions-toggle-cat-1'));
    fireEvent.click(screen.getByTestId('add-products-button'));
    expect(onAddProducts).toHaveBeenCalledTimes(1);
  });

  it('closes the menu on outside click', () => {
    render(
      <Wrapper>
        <CategoryActionsMenu
          category={makeCategory()}
          onEditCategory={vi.fn()}
          onAddProduct={vi.fn()}
          onAddProducts={vi.fn()}
        />
        <div data-testid="outside">outside</div>
      </Wrapper>,
    );
    fireEvent.click(screen.getByTestId('category-actions-toggle-cat-1'));
    expect(screen.getByTestId('edit-category-button')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('edit-category-button')).not.toBeInTheDocument();
  });
});
