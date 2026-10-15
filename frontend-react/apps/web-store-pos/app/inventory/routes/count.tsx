import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { InventoryOfflineService } from '../lib/services/inventory-offline-service';
import type { InventoryCategoryView } from '../lib/services/inventory-offline-service';
import { ProductRepository } from '~/sales/lib/repositories/product-repository';
import { ProductCategoryRepository } from '~/sales/lib/repositories/product-category-repository';
import { ProductCountList } from '../components/product-count-list';
import { filterInventoryCategories } from '../components/inventory-product-list';

export const clientLoader = featureLoader([EFeatures.Available]);

/**
 * Conteo de productos — vista propia (separada de `/inventory/available`) y
 * SOLO VISUAL: los conteos viven en el estado de esta pantalla, no se guardan
 * en `localStorage` ni en el backend, y no ajustan el stock. El botón Limpiar
 * borra todos los conteos y deja la vista en cero.
 */
export function ProductCountPage() {
  const intl = useIntl();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.selectedStoreId ?? '';
  const [categories, setCategories] = useState<InventoryCategoryView[]>([]);
  const [search, setSearch] = useState('');
  // Solo visual: estado de la pantalla, nada persistido.
  const [counts, setCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    const inventorySvc = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );
    const response = inventorySvc.getInventoryCategoriesView();
    if (!response.succeeded) return;
    setCategories(response.data);
  }, [storeId]);

  const visible = filterInventoryCategories(categories, search);
  const productCount = visible.reduce((sum, cat) => sum + cat.products.length, 0);

  function handleCountChange(productId: string, value: string) {
    setCounts((current) => ({ ...current, [productId]: value }));
  }

  function handleClear() {
    setCounts({});
  }

  return (
    <Card
      padding="tight"
      title={
        <span className="flex items-center gap-2">
          {intl.formatMessage({ id: 'INVENTORY.COUNT.TITLE' })}
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            ({productCount})
          </span>
        </span>
      }
      headerAction={
        <Button
          variant="outline"
          data-testid="product-count-clear"
          onClick={handleClear}
        >
          {intl.formatMessage({ id: 'INVENTORY.COUNT.CLEAR' })}
        </Button>
      }
    >
      {categories.length === 0 ? (
        <div className="py-8 text-center text-text-muted">
          {intl.formatMessage({ id: 'INVENTORY.NO_ENTRY_FOUND' })}
        </div>
      ) : (
        <ProductCountList
          categories={visible}
          search={search}
          onSearchChange={setSearch}
          counts={counts}
          onCountChange={handleCountChange}
        />
      )}
    </Card>
  );
}

export default ProductCountPage;
