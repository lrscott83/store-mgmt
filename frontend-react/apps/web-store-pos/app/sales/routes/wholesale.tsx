import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, Result } from '@store-mgmt/domain';
import { EFeatures, OrderType, ProductErrors } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { showBlockingError } from '~/shared/lib/blocking-alert';
import { showToastSuccess } from '~/shared/lib/toast';
import { formatCurrency } from '~/shared/lib/format-currency';
import { hasInventoryModuleAvailable } from '~/shared/lib/auth/authorization-service';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { createProductService } from '../lib/services/product-service.factory';
import { createProductCategoryService } from '../lib/services/product-category-service.factory';
import { hasAvailableProductToSale } from '../lib/product-availability';
import { resolveWholesalePrice, wholesaleUnits } from '../lib/wholesale';

// Mismo guard que la venta normal: feature Ventas.
export const clientLoader = featureLoader([EFeatures.Sale]);

/**
 * Ventas Mayoristas — misma venta que la normal, pero la cantidad se pide por PAQUETES
 * (6, 10, 12, 24, 30… según la config del producto) y el precio por unidad baja por escalones.
 * - `quantity` en el carrito = packs × packSize (unidades reales) → el inventario descuenta igual.
 * - `price` por línea = precio por UNIDAD del escalón aplicado (ej: 12 × 24 × 660).
 * - `OrderType.Mayorista` fluye tal cual al crear la orden.
 */
export function WholesalePage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const addItem = useCartStore((s) => s.addItem);
  const getCartItemQuantity = useCartStore((s) => s.getItemQuantity);

  const [products, setProducts] = useState<Product[]>([]);
  const [packsByProduct, setPacksByProduct] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!storeId) return;
    const categoryService = createProductCategoryService(storeId);
    categoryService.getAvailableProductCategories().then((categoriesResult) => {
      const categories = categoriesResult.data ?? [];
      const productService = createProductService(storeId);
      Promise.all(categories.map((c) => productService.getProductsToSaleByCategoryId(c.id))).then(
        (results) => {
          const wholesaleProducts = results
            .flatMap((r) => r.data ?? [])
            .filter((p) => p.wholesaleEnabled && p.wholesalePackSize && p.wholesaleTiers?.length);
          setProducts(wholesaleProducts);
        },
      );
    });
  }, [storeId]);

  /** Mismo gate de inventario que la venta normal, pero SIEMPRE en unidades (packs × packSize). */
  function availabilityGate(product: Product | undefined, productId: string, units: number): Result {
    const inventoryService = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    return hasAvailableProductToSale({
      product,
      quantity: units,
      cartQuantity: getCartItemQuantity(productId),
      hasInventoryModule: user ? hasInventoryModuleAvailable(user) : false,
      inventory: inventoryService.getAvailableQuantity(productId),
    });
  }

  function handleAdd(product: Product) {
    const packs = parseInt(packsByProduct[product.id] ?? '', 10) || 0;
    if (packs <= 0) return;

    const packSize = product.wholesalePackSize ?? 0;
    const units = wholesaleUnits(packs, packSize);
    const availability = availabilityGate(product, product.id, units);
    if (!availability.succeeded) {
      const message =
        availability.errors[0]?.description ?? ProductErrors.ProductNotAvailable.description;
      showBlockingError(intl.formatMessage({ id: 'GENERAL.RESPONSE.ERROR_TITLE' }), message);
      return;
    }

    const { unitPrice } = resolveWholesalePrice(product, packs);
    addItem(product, units, OrderType.Mayorista, unitPrice);
    showToastSuccess(
      intl.formatMessage({ id: 'SALES.WHOLESALE.ADDED' }, { name: product.name }),
      intl.formatMessage({ id: 'GENERAL.RESPONSE.SUCCESS_TITLE' }),
    );
    setPacksByProduct((prev) => ({ ...prev, [product.id]: '' }));
  }

  return (
    <Card padding="tight" title={intl.formatMessage({ id: 'SALES.WHOLESALE.HEADER' })}>
      {products.length === 0 ? (
        <InfoBox variant="info" className="text-center">
          {intl.formatMessage({ id: 'SALES.WHOLESALE.EMPTY' })}
        </InfoBox>
      ) : (
        <div className="divide-y divide-border">
          {products.map((product) => {
            const packSize = product.wholesalePackSize ?? 0;
            const packs = parseInt(packsByProduct[product.id] ?? '', 10) || 0;
            const { unitPrice, total } = resolveWholesalePrice(product, packs);
            return (
              <div key={product.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">{product.name}</p>
                  <p className="text-xs text-text-muted">
                    {intl.formatMessage({ id: 'SALES.WHOLESALE.UNITS_PER_PACK' })}: {packSize} ·{' '}
                    {intl.formatMessage({ id: 'SALES.WHOLESALE.FROM' })} {formatCurrency(unitPrice)}{' '}
                    / {intl.formatMessage({ id: 'SALES.WHOLESALE.UNIT' })}
                  </p>
                  {packs > 0 && (
                    <p className="text-xs text-primary" data-testid={`wholesale-quote-${product.id}`}>
                      {packs} × {packSize} × {formatCurrency(unitPrice)} = {formatCurrency(total)}
                    </p>
                  )}
                </div>

                <label className="flex flex-col gap-0.5 text-xs text-muted">
                  {intl.formatMessage({ id: 'SALES.WHOLESALE.PACKS' })}
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={packsByProduct[product.id] ?? ''}
                    onChange={(e) =>
                      setPacksByProduct((prev) => ({ ...prev, [product.id]: e.target.value }))
                    }
                    className="w-20 rounded-md border border-border px-2 py-1 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
                    data-testid={`wholesale-packs-input-${product.id}`}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => handleAdd(product)}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary-hover transition-colors"
                  data-testid={`wholesale-add-${product.id}`}
                >
                  {intl.formatMessage({ id: 'SALES.WHOLESALE.ADD' })}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default WholesalePage;