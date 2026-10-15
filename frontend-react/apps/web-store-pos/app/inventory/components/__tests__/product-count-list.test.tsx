import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { InventoryCategoryView } from '~/inventory/lib/services/inventory-offline-service';
import { ProductCountList, countDifference } from '../product-count-list';

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <IntlProvider messages={esMessages} locale="es" defaultLocale="es">
      {children}
    </IntlProvider>
  );
}

const CATEGORIES: InventoryCategoryView[] = [
  {
    categoryId: 'cat1',
    categoryName: 'Bebidas',
    totalQuantity: 122,
    totalCostPrice: 100,
    products: [
      {
        productId: 'p1',
        productName: 'Producto 1',
        categoryId: 'cat1',
        categoryName: 'Bebidas',
        totalAvailable: 34,
        avgCostPrice: 2,
      },
      {
        productId: 'p2',
        productName: 'Producto 11',
        categoryId: 'cat1',
        categoryName: 'Bebidas',
        totalAvailable: 88,
        avgCostPrice: 3,
      },
    ],
  },
  {
    categoryId: 'cat2',
    categoryName: 'Snacks',
    totalQuantity: 8,
    totalCostPrice: 40,
    products: [
      {
        productId: 'p3',
        productName: 'Papas Lays',
        categoryId: 'cat2',
        categoryName: 'Snacks',
        totalAvailable: 8,
        avgCostPrice: 5,
      },
    ],
  },
];

function renderList(overrides: Partial<React.ComponentProps<typeof ProductCountList>> = {}) {
  const props: React.ComponentProps<typeof ProductCountList> = {
    categories: CATEGORIES,
    search: '',
    onSearchChange: () => {},
    counts: {},
    onCountChange: () => {},
    ...overrides,
  };
  return render(
    <Wrapper>
      <ProductCountList {...props} />
    </Wrapper>,
  );
}

describe('countDifference — pure function', () => {
  it('devuelve null cuando la fila no se ha contado (vacía)', () => {
    expect(countDifference(undefined, 34)).toBeNull();
    expect(countDifference('', 34)).toBeNull();
    expect(countDifference('   ', 34)).toBeNull();
  });

  it('devuelve null cuando el valor no es numérico', () => {
    expect(countDifference('abc', 34)).toBeNull();
  });

  it('resta el sistema a la cantidad contada', () => {
    expect(countDifference('30', 34)).toBe(-4);
    expect(countDifference('88', 88)).toBe(0);
    expect(countDifference('90', 88)).toBe(2);
  });
});

describe('ProductCountList — paneles colapsables por categoría', () => {
  it('renderiza las categorías colapsadas por defecto y expande al hacer clic', () => {
    renderList();

    expect(screen.getByText('Bebidas (2)')).toBeInTheDocument();
    expect(screen.getByText('Snacks (1)')).toBeInTheDocument();
    // Las filas de producto NO se ven hasta expandir.
    expect(screen.queryByTestId('product-count-row-p1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('product-count-category-toggle-cat1'));
    expect(screen.getByTestId('product-count-row-p1')).toBeInTheDocument();
    expect(screen.getByTestId('product-count-row-p2')).toBeInTheDocument();
    // La otra categoría sigue colapsada.
    expect(screen.queryByTestId('product-count-row-p3')).not.toBeInTheDocument();
  });

  it('auto-expande la categoría con resultados de búsqueda', () => {
    renderList({ search: 'lays' });
    expect(screen.getByTestId('product-count-row-p3')).toBeInTheDocument();
    expect(screen.queryByTestId('product-count-row-p1')).not.toBeInTheDocument();
  });
});

describe('ProductCountList — fila del producto (número, nombre, Sistema, Conteo)', () => {
  it('muestra la fila numerada con el nombre, la cantidad del sistema y el campo Conteo', () => {
    renderList();
    fireEvent.click(screen.getByTestId('product-count-category-toggle-cat1'));

    const row = screen.getByTestId('product-count-row-p1');
    expect(row).toHaveTextContent('1');
    expect(row).toHaveTextContent('Producto 1');
    expect(row).toHaveTextContent('Sistema: 34 uds');
    expect(within(row).getByLabelText('Conteo')).toBeInTheDocument();
    expect(screen.getByTestId('inventory-count-input-p1')).toHaveValue(null);
  });

  it('sin conteo la diferencia es — (neutra)', () => {
    renderList();
    fireEvent.click(screen.getByTestId('product-count-category-toggle-cat1'));

    const difference = screen.getByTestId('inventory-count-difference-p1');
    expect(difference).toHaveTextContent('—');
    expect(difference.className).not.toContain('text-danger');
    expect(difference.className).not.toContain('text-success');
  });

  it('diferencia negativa (contado menor que el sistema) en rojo con signo -', () => {
    renderList({ counts: { p1: '30' } });
    fireEvent.click(screen.getByTestId('product-count-category-toggle-cat1'));

    const difference = screen.getByTestId('inventory-count-difference-p1');
    expect(difference).toHaveTextContent('-4');
    expect(difference.className).toContain('text-danger');
  });

  it('diferencia cero muestra el checkbox verde de "correcto" en vez del número', () => {
    renderList({ counts: { p2: '88' } });
    fireEvent.click(screen.getByTestId('product-count-category-toggle-cat1'));

    const checkbox = screen.getByTestId('inventory-count-correct-p2');
    expect(checkbox).toBeChecked();
    expect(checkbox).toBeDisabled();
    expect(checkbox.className).toContain('accent-success');
    // El número se sustituye por el checkbox, no conviven.
    expect(screen.getByTestId('inventory-count-difference-p2')).not.toHaveTextContent('+0');
  });

  it('diferencia positiva en verde con signo +', () => {
    renderList({ counts: { p1: '40' } });
    fireEvent.click(screen.getByTestId('product-count-category-toggle-cat1'));

    const difference = screen.getByTestId('inventory-count-difference-p1');
    expect(difference).toHaveTextContent('+6');
    expect(difference.className).toContain('text-success');
  });
});

describe('ProductCountList — buscador', () => {
  it('muestra el buscador y avisa cuando nada coincide', () => {
    renderList({ search: 'zzz' });

    expect(screen.getByTestId('product-count-search')).toBeInTheDocument();
    expect(
      screen.getByText(esMessages['INVENTORY.CATEGORY_PRODUCT_NO_FOUND']),
    ).toBeInTheDocument();
  });
});
