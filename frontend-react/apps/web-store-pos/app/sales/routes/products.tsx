import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { PlusIcon, PaperclipIcon } from '~/shared/components/ui/icons';
import { ProductOfflineService } from '../lib/services/product-offline-service';
import { ProductCategoryOfflineService } from '../lib/services/product-category-offline-service';
import { CategoryProductList } from '../components/category-product-list';
import { CreateProductModal } from '../components/create-product-modal';
import { EditProductModal } from '../components/edit-product-modal';
import { EditProductsModal } from '../components/edit-products-modal';
import { EditProductCategoryModal } from '../components/edit-product-category-modal';
import { CsvProductImporterModal } from '../components/csv-product-importer-modal';

export const clientLoader = featureLoader([EFeatures.Products]);

type Modal =
  | { type: 'create'; category: ProductCategory }
  | { type: 'edit'; product: Product }
  | { type: 'bulk'; category: ProductCategory }
  | { type: 'category'; category?: ProductCategory }
  | { type: 'csv' };

export function ProductsPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Modal | null>(null);

  const productService = new ProductOfflineService(storeId);
  const categoryService = new ProductCategoryOfflineService(storeId);

  function loadData() {
    setProducts(productService.getAll());
    setCategories(categoryService.getAll());
  }

  useEffect(() => {
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  function togglePanel(categoryId: string) {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  // --- Create product ---
  function handleCreateProduct(data: {
    name: string;
    price: number;
    barcode?: string;
    categoryId: string;
    availableToSale: boolean;
    discountFromInvantory: boolean;
  }) {
    const cat = categories.find((c) => c.id === data.categoryId);
    productService.create({
      ...data,
      categoryName: cat?.name ?? '',
      order: 1,
      isActive: true,
      businessId: '',
    });
    loadData();
    setModal(null);
  }

  // --- Edit product ---
  function handleEditProduct(product: Product) {
    productService.update(product);
    loadData();
    setModal(null);
  }

  // --- Delete product ---
  function handleDeleteProduct(id: string) {
    productService.delete(id);
    loadData();
    setModal(null);
  }

  // --- Bulk edit (per-category "Nuevo Productos" -> bulk price edit) ---
  function handleBulkSave(updatedProducts: Product[]) {
    productService.updateMany(updatedProducts);
    loadData();
    setModal(null);
  }

  // --- Category save ---
  function handleCategorySave(data: { name: string; order: number; isActive: boolean; id?: string }) {
    if (data.id) {
      const existing = categoryService.getById(data.id);
      if (existing) {
        categoryService.save({ ...existing, name: data.name, order: data.order, isActive: data.isActive });
      }
    } else {
      const id = categoryService.addByName(data.name);
      const created = categoryService.getById(id);
      if (created) {
        categoryService.save({ ...created, order: data.order, isActive: data.isActive });
      }
    }
    loadData();
    setModal(null);
  }

  // --- CSV import ---
  function handleCsvImport(rows: { name: string; price: number; barcode?: string; category?: string }[]) {
    for (const row of rows) {
      let categoryId: string;
      if (row.category) {
        const existing = categoryService.getByName(row.category);
        categoryId = existing ? existing.id : categoryService.addByName(row.category);
      } else {
        categoryId = categories[0]?.id ?? '';
      }
      const cat = categoryService.getById(categoryId);
      productService.create({
        name: row.name,
        price: row.price,
        barcode: row.barcode,
        categoryId,
        categoryName: cat?.name ?? '',
        order: 1,
        isActive: true,
        availableToSale: true,
        discountFromInvantory: false,
        businessId: '',
      });
    }
    loadData();
    setModal(null);
  }

  const existingBarcodes = products.filter((p) => p.barcode).map((p) => p.barcode as string);
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      <Card
        title={
          <div className="flex items-center justify-between">
            {/* PRODUCT.PRODUCTS */}
            <span>{intl.formatMessage({ id: 'PRODUCT.PRODUCTS' })}</span>
            <Button variant="fab" onClick={() => setModal({ type: 'category' })} data-testid="add-category-button">
              {/* Angular: <mat-icon>add</mat-icon> */}
              <PlusIcon />
              {/* PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY */}
              {intl.formatMessage({ id: 'PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY' })}
            </Button>
          </div>
        }
      >
        {/* Category-driven info-box — shown only while there are no categories */}
        {categories.length === 0 && (
          <InfoBox variant="info" className="mb-4 text-center">
            {/* PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY_ALERT_MESSAGE */}
            {intl.formatMessage({ id: 'PRODUCT_CATEGORY.NEW_PRODUCT_CATEGORY_ALERT_MESSAGE' })}
          </InfoBox>
        )}

        <div className="flex justify-end mb-4">
          <Button variant="fab" onClick={() => setModal({ type: 'csv' })} data-testid="import-csv-button">
            {/* Angular: <mat-icon>attach_file</mat-icon> */}
            <PaperclipIcon />
            {/* PRODUCT_CATEGORY.IMPORT_PRODUCTS */}
            {intl.formatMessage({ id: 'PRODUCT_CATEGORY.IMPORT_PRODUCTS' })}
          </Button>
        </div>

        {/* Accordion: one panel per category, collapsed by default */}
        <div className="space-y-2">
          {sortedCategories.map((category) => {
            const categoryProducts = products.filter((p) => p.categoryId === category.id && p.isActive);
            const isExpanded = expandedCategoryIds.has(category.id);
            return (
              <div key={category.id} className="rounded-lg border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => togglePanel(category.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  data-testid={`category-panel-toggle-${category.id}`}
                  aria-expanded={isExpanded}
                >
                  <span className="flex-1 text-base font-medium text-text">{category.name}</span>
                  <span className="text-sm text-text-muted">{categoryProducts.length}</span>
                  {/* Angular's mat-expansion-panel toggle indicator (rotates when open). */}
                  <svg
                    className={`h-5 w-5 shrink-0 text-text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3">
                    <CategoryProductList
                      category={category}
                      products={categoryProducts}
                      onEditCategory={() => setModal({ type: 'category', category })}
                      onAddProduct={() => setModal({ type: 'create', category })}
                      onAddProducts={() => setModal({ type: 'bulk', category })}
                      onEditProduct={(product) => setModal({ type: 'edit', product })}
                      onDeleteProduct={handleDeleteProduct}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Modals */}
      {modal?.type === 'create' && (
        <CreateProductModal
          categories={categories}
          onSave={handleCreateProduct}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'edit' && (
        <EditProductModal
          product={modal.product}
          categories={categories}
          onSave={handleEditProduct}
          onDelete={handleDeleteProduct}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'bulk' && (
        <EditProductsModal
          products={products.filter((p) => p.isActive && p.categoryId === modal.category.id)}
          onSave={handleBulkSave}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'category' && (
        <EditProductCategoryModal
          category={modal.category}
          onSave={handleCategorySave}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'csv' && (
        <CsvProductImporterModal
          existingBarcodes={existingBarcodes}
          onImport={handleCsvImport}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

export default ProductsPage;
