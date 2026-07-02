import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CategoryStats } from '../category-stats';
import type { CategoryCartItemsView } from '../../lib/category-cart-items-view';

function makeCategory(overrides: Partial<CategoryCartItemsView> = {}): CategoryCartItemsView {
  return {
    id: 'cat1',
    name: 'Bebidas',
    order: 1,
    total: 25,
    itemsCount: 5,
    productItems: [],
    ...overrides,
  };
}

describe('CategoryStats (Angular category-stats.component.html 1:1 port)', () => {
  it('renders the category name, items count, and total', () => {
    render(<CategoryStats category={makeCategory()} />);
    expect(screen.getByText('Bebidas')).toBeInTheDocument();
    expect(screen.getByText('(5)')).toBeInTheDocument();
    expect(screen.getByText('$25.00')).toBeInTheDocument();
  });

  it('renders one row per product in productItems', () => {
    render(
      <CategoryStats
        category={makeCategory({
          productItems: [
            { name: 'Cola', order: 1, total: 10, itemsCount: 2, price: 5 },
            { name: 'Fanta', order: 2, total: 3, itemsCount: 1, price: 3 },
          ],
        })}
      />,
    );
    expect(screen.getByText('Cola')).toBeInTheDocument();
    expect(screen.getByText('$10.00')).toBeInTheDocument();
    expect(screen.getByText('Fanta')).toBeInTheDocument();
    expect(screen.getByText('$3.00')).toBeInTheDocument();
  });

  it('renders nothing when category is falsy (matches Angular @if(category))', () => {
    // @ts-expect-error — intentionally testing the falsy-category guard
    const { container } = render(<CategoryStats category={null} />);
    expect(container.firstChild).toBeNull();
  });
});
