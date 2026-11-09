import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import esMessages from '~/shared/lib/i18n/es';
import type { PublicCatalogProduct } from '~/sales/lib/services/catalog-http-service';

const infoHtmlMock = vi.hoisted(() => vi.fn());
vi.mock('~/shared/lib/blocking-alert', () => ({
  showBlockingInfoHtml: (...args: unknown[]) => infoHtmlMock(...args),
  showBlockingError: vi.fn(),
}));

import { WholesaleTiersInfo } from '~/catalog/components/wholesale-tiers-info';

function product(overrides: Partial<PublicCatalogProduct> = {}): PublicCatalogProduct {
  return {
    id: 'cerveza',
    name: 'Cerveza',
    description: 'Caja de 12',
    price: 100,
    finalPrice: 100,
    hasDiscount: false,
    percentDiscountPrice: 0,
    percentDiscount: 0,
    discountPrice: 0,
    discountAmount: 0,
    isNew: false,
    currency: 'CUP',
    categoryId: 'c1',
    categoryName: 'Bebidas',
    categorySlug: 'bebidas',
    imageUrl: null,
    imageUrls: [],
    priceMode: 'Wholesale',
    wholesaleEnabled: true,
    wholesalePackSize: 12,
    wholesaleUnitLabel: 'caja',
    wholesaleMinPacks: 3,
    wholesaleUnitPrice: 32,
    wholesalePackPrice: 384,
    wholesaleTiers: [
      { minPacks: 10, pricePerUnit: 28, packPrice: 336 },
      { minPacks: 3, pricePerUnit: 32, packPrice: 384 },
    ],
    ...overrides,
  };
}

function renderInfo(product: PublicCatalogProduct) {
  return render(
    <IntlProvider locale="es" messages={esMessages}>
      <WholesaleTiersInfo product={product} />
    </IntlProvider>,
  );
}

describe('WholesaleTiersInfo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('abre el popup con los rangos ORDENADOS por mínimo de paquetes', () => {
    renderInfo(product());

    fireEvent.click(screen.getByTestId('catalog-wholesale-info-cerveza'));

    expect(infoHtmlMock).toHaveBeenCalledTimes(1);
    const html = infoHtmlMock.mock.calls[0]?.[1] as string;
    expect(html).toContain('Desde 3 cajas');
    expect(html).toContain('Desde 10 cajas');
    expect(html.indexOf('Desde 3 cajas')).toBeLessThan(html.indexOf('Desde 10 cajas'));
  });

  it('no pinta nada cuando el producto no se vende por paquetes', () => {
    renderInfo(product({ priceMode: 'Unit' }));
    expect(screen.queryByTestId('catalog-wholesale-info-cerveza')).not.toBeInTheDocument();
  });
});
