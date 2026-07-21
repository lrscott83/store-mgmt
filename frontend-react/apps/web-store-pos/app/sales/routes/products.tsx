import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, ProductCategory, ProductCategoryView } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { PlusIcon, PaperclipIcon, ChevronDownIcon } from '~/shared/components/ui/icons';
import { showBlockingError, showBlockingSuccess, showBlockingInfo, confirmDialog } from '~/shared/lib/blocking-alert';
import { createProductService } from '../lib/services/product-service.factory';
import { createProductCategoryService } from '../lib/services/product-category-service.factory';
import type { ParsedProductRow } from '../lib/csv-product-parser';
import { CategoryProductList } from '../components/category-product-list';
import { CategoryActionsMenu } from '../components/category-actions-menu';
import { CreateProductModal } from '../components/create-product-modal';
import { EditProductModal } from '../components/edit-product-modal';
import { EditProductsModal } from '../components/edit-products-modal';
import { EditProductCategoryModal } from '../components/edit-product-category-modal';
import { CsvProductImporterModal } from '../components/csv-product-importer-modal';

export const clientLoader = featureLoader([EFeatures.Products]);

type Modal =
  | { type: 'create'; category: ProductCategory; defaultOrder: number }
  | { type: 'edit'; product: Product }
  | { type: 'bulk'; category: ProductCategory }
  | { type: 'category'; category?: ProductCategory }
  | { type: 'csv' };

export function ProductsPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [categories, setCategories] = useState<ProductCategoryView[]>([]);
  const [productsByCategory, setProductsByCategory] = useState<Record<string, Product[]>>({});
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Modal | null>(null);

  const productService = createProductService(storeId);
  const categoryService = createProductCategoryService(storeId);

  // Angular parity (products.component.ts:30-40): categories via getProductCategoriesView
  // (active-only, WITH productsCount); mirrors Angular's eager-mount-all
  // CategoryProductListComponent behavior by fetching every category's product list up front
  // via getAvailableProductsByCategoryId, cached per category id (Flag #1).
  async function loadData() {
    const categoriesResult = await categoryService.getProductCategoriesView();
    const categoriesData = categoriesResult.data ?? [];
    setCategories(categoriesData);

    const productLists = await Promise.all(
      categoriesData.map((c) => productService.getAvailableProductsByCategoryId(c.id)),
    );
    const cache: Record<string, Product[]> = {};
    categoriesData.forEach((c, i) => {
      cache[c.id] = productLists[i].data ?? [];
    });
    setProductsByCategory(cache);
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

  // --- Add product (opens the create modal) ---
  // Angular parity (edit-product-modal.component.ts:42-49): opening the modal for create awaits
  // productService.getMaxOrder(category.id) and prefills Orden with data+1.
  async function handleAddProduct(category: ProductCategory) {
    const maxOrderResult = await productService.getMaxOrder(category.id);
    setModal({ type: 'create', category, defaultOrder: (maxOrderResult.data ?? 0) + 1 });
  }

  // --- Create product ---
  // Angular parity (edit-product-modal.component.ts:88-112): createProduct(...) positional
  // async surface; on failure surface errors[0].description via the same blocking-error path as
  // handleCategorySave (Angular's Swal error). order/isActive now come from the modal's own
  // Orden/Activo fields (Angular form controls), not hardcoded.
  async function handleCreateProduct(data: {
    name: string;
    price: number;
    barcode?: string;
    categoryId: string;
    order: number;
    isActive: boolean;
    availableToSale: boolean;
    discountFromInvantory: boolean;
  }) {
    const result = await productService.createProduct(
      data.categoryId,
      data.name,
      data.price,
      '',
      data.order,
      data.isActive,
      data.availableToSale,
      data.discountFromInvantory,
      data.barcode,
    );
    if (!result.succeeded) {
      showBlockingError(intl.formatMessage({ id: 'GENERAL.ERROR' }), result.errors[0]?.description ?? '');
      return;
    }
    loadData();
    setModal(null);
  }

  // --- Edit product ---
  // Angular parity (edit-product-modal.component.ts:113-138): updateProduct(...) positional
  // async surface; same failure surfacing.
  async function handleEditProduct(product: Product) {
    const result = await productService.updateProduct(
      product.id,
      product.categoryId,
      product.name,
      product.price,
      product.businessId,
      product.order,
      product.isActive,
      product.availableToSale,
      product.discountFromInvantory,
      // Angular parity (edit-product-modal.component.ts:125): the barcode FormControl is
      // commented out, so `barcodeValue` is ALWAYS undefined on update — even for a product
      // that already has a stored barcode.
      undefined,
    );
    if (!result.succeeded) {
      showBlockingError(intl.formatMessage({ id: 'GENERAL.ERROR' }), result.errors[0]?.description ?? '');
      return;
    }
    loadData();
    setModal(null);
  }

  // --- Delete product ---
  // Angular parity (category-product-list.component.ts:86-103, onDeleteProduct): a blocking
  // confirmDialog Swal (question icon, GENERAL.DELETE_CONFIRM_TITLE/MESSAGE_A with
  // {name: PRODUCT.TEXT}) gates the delete — only proceeds on isConfirmed. deleteProduct
  // itself always resolves success (soft-delete, never fails) once confirmed.
  async function handleDeleteProduct(id: string) {
    const confirmed = await confirmDialog({
      title: intl.formatMessage({ id: 'GENERAL.DELETE_CONFIRM_TITLE' }),
      message: intl.formatMessage(
        { id: 'GENERAL.DELETE_CONFIRM_MESSAGE_A' },
        { name: intl.formatMessage({ id: 'PRODUCT.TEXT' }) },
      ),
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;

    await productService.deleteProduct(id);
    loadData();
    setModal(null);
  }

  // --- Bulk create (per-category "Nuevo Productos" -> bulk-CREATE, Angular parity) ---
  // Angular parity (edit-products-modal.component.ts:74-107): "Nuevo Productos" bulk-CREATES
  // new products (createProducts) — it never edits existing ones. Angular's onSubmit closes
  // the modal and emits the update event UNCONDITIONALLY (before checking `response.succeeded`);
  // the Swal error is purely informational when some names already existed.
  async function handleBulkSave(categoryId: string, items: { name: string; price: number }[]) {
    const result = await productService.createProducts(categoryId, items);
    setModal(null);
    loadData();
    if (!result.succeeded) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        'Algunos productos no fueron adicionados porque ya existen.',
      );
    }
  }

  // --- Category save ---
  // Angular parity (edit-product-category-modal.component.ts:50-80): create ->
  // createProductCategory, update -> updateProductCategory, each a single call (no
  // fetch-then-save two/three-step). On failure, surface it via the same
  // Swal-error shape Angular uses (`icon: 'error', title: GENERAL.ERROR, text:
  // errors[0].description`) instead of silently swallowing it.
  async function handleCategorySave(data: { name: string; order: number; isActive: boolean; id?: string }) {
    const result = data.id
      ? await categoryService.updateProductCategory(data.id, data.name, data.order, data.isActive)
      : await categoryService.createProductCategory(data.name, data.order, data.isActive);

    if (!result.succeeded) {
      showBlockingError(intl.formatMessage({ id: 'GENERAL.ERROR' }), result.errors[0]?.description ?? '');
      return;
    }

    loadData();
    setModal(null);
  }

  // --- CSV import ---
  // Angular parity (product-offline.service.ts:74-84 createCsvProducts + csv-product.service.ts
  // validateProducts): category resolution/creation happens INSIDE createCsvProducts (per row,
  // by name). Rows without a category are filtered out here, mirroring Angular's
  // `validateProducts` (`item['category'] && item['name'] && price`). No barcode (Flag #2).
  async function handleCsvImport(rows: ParsedProductRow[]) {
    const csvProducts = rows
      .filter((row) => row.category)
      .map((row) => ({ category: row.category as string, name: row.name, price: row.price }));
    const result = await productService.createCsvProducts(csvProducts);
    loadData();
    setModal(null);

    // Angular handleSuccess (csv-product-importer-modal.component.ts:52-65): ALWAYS a success
    // toast with the imported count, PLUS a conditional info dialog when the response did not
    // fully succeed ("some already exist"). React has no toast system, so both Angular messages
    // are surfaced via Swal wrappers; the Spanish literals are Angular's own (component.ts:60,64),
    // preserved verbatim. Shown sequentially since Swal is modal.
    await showBlockingSuccess(`Importados ${csvProducts.length} productos correctamente.`);
    if (!result.succeeded) {
      await showBlockingInfo(
        intl.formatMessage({ id: 'GENERAL.INFORMATION' }),
        'Algunos productos no fueron importados porque ya existen.',
      );
    }
  }

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
            const categoryProducts = productsByCategory[category.id] ?? [];
            const isExpanded = expandedCategoryIds.has(category.id);
            return (
              <div key={category.id} className="rounded-lg border border-border bg-surface">
                {/* Header row: name+count toggle the panel; a gear menu sits to the LEFT of
                    the chevron and exposes the category actions WITHOUT expanding — clicking
                    the gear must not toggle. The chevron is its own toggle button so the gear
                    can be a sibling (nested <button>s are invalid HTML). */}
                <div className="flex w-full items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => togglePanel(category.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                    data-testid={`category-panel-toggle-${category.id}`}
                    aria-expanded={isExpanded}
                  >
                    <span className="flex-1 text-base font-medium text-text">{category.name}</span>
                    {/* Angular parity (products.component.ts:30-40): badge uses
                        getProductCategoriesView's productsCount (isActive && availableToSale) —
                        a DIFFERENT filter than the panel's own product list below (isActive-only),
                        a deliberate Angular quirk (spec.md "three separate filters"). */}
                    <span className="text-sm text-text-muted">{category.productsCount}</span>
                  </button>
                  <CategoryActionsMenu
                    category={category}
                    onEditCategory={() => setModal({ type: 'category', category })}
                    onAddProduct={() => handleAddProduct(category)}
                    onAddProducts={() => setModal({ type: 'bulk', category })}
                  />
                  <button
                    type="button"
                    onClick={() => togglePanel(category.id)}
                    className="shrink-0 rounded p-0.5 text-text-muted hover:text-text"
                    aria-label="Expandir o contraer categoría"
                    aria-expanded={isExpanded}
                  >
                    <ChevronDownIcon isExpanded={isExpanded} />
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t border-border px-4 py-3">
                    <CategoryProductList
                      products={categoryProducts}
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
          category={modal.category}
          defaultOrder={modal.defaultOrder}
          onSave={handleCreateProduct}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'edit' && (
        <EditProductModal
          product={modal.product}
          onSave={handleEditProduct}
          onClose={() => setModal(null)}
        />
      )}

      {modal?.type === 'bulk' && (
        <EditProductsModal
          categoryId={modal.category.id}
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
          onImport={handleCsvImport}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

export default ProductsPage;
