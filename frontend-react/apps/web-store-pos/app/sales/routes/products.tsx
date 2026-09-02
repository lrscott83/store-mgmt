import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { CsvProduct, Product, ProductCategory, ProductCategoryView } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { Button } from '~/shared/components/ui/button';
import { Card } from '~/shared/components/ui/card';
import { InfoBox } from '~/shared/components/ui/info-box';
import { PlusIcon, PaperclipIcon, ChevronDownIcon, TrashIcon } from '~/shared/components/ui/icons';
import { showBlockingError, confirmDialog } from '~/shared/lib/blocking-alert';
import { showToastSuccess } from '~/shared/lib/toast';
import { InventoryOfflineService } from '~/inventory/lib/services/inventory-offline-service';
import { isOwnerAdmin } from '~/shared/lib/auth/authorization-service';
import { useCartStore } from '~/shared/lib/stores/cart-store';
import { clearStoreData } from '~/shared/lib/storage/store-data-reset';
import { createProductService } from '../lib/services/product-service.factory';
import { createProductCategoryService } from '../lib/services/product-category-service.factory';
import { ProductRepository } from '../lib/repositories/product-repository';
import { ProductCategoryRepository } from '../lib/repositories/product-category-repository';
import type { ParsedProductRow } from '../lib/csv-product-parser';
import { CategoryProductList } from '../components/category-product-list';
import { InactiveBadge } from '../components/inactive-badge';
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
  | { type: 'category'; category?: ProductCategory; defaultOrder: number }
  | { type: 'csv' };

export function ProductsPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');
  // The wipe is irreversible and local-only, so this is a render guard, not an
  // authorization boundary — there is no server call to protect.
  const isOwner = useAuthStore((s) => (s.user ? isOwnerAdmin(s.user) : false));
  const clearCart = useCartStore((s) => s.clear);

  const [categories, setCategories] = useState<ProductCategoryView[]>([]);
  const [productsByCategory, setProductsByCategory] = useState<Record<string, Product[]>>({});
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<Modal | null>(null);

  const productService = createProductService(storeId);
  const categoryService = createProductCategoryService(storeId);

  // Angular parity (products.component.ts:30-40): categories via getProductCategoriesView,
  // which now returns EVERY category (active and inactive) with productsCount as the
  // category's TOTAL product count; mirrors Angular's eager-mount-all CategoryProductListComponent
  // behavior by fetching every category's full product list up front via
  // getAvailableProductsByCategoryId (also unfiltered by isActive/availableToSale now), cached
  // per category id (Flag #1). Inactive rows are marked, not hidden — see InactiveBadge.
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
    // logout() (auth-store.ts:352-353) releases the DEK and nulls the user synchronously,
    // and only then redirects — through /login's async guestOnlyLoader, so this page is
    // still mounted when storeId (above) falls back to ''. Reloading from that state reaches
    // the category repository's auto-init write (product-category-repository.ts:246-247) with
    // no DEK in memory: it throws MissingDataKeyError, and the resulting blocking alert
    // outlives the navigation to sit on top of the login screen. An unselected store has
    // nothing to load.
    if (!storeId) return;

    // Deliberately unawaited, and deliberately unguarded: a decryption failure
    // here rejects, and root.tsx's app-wide policy answers it once for the
    // whole app (design D5). The per-call-site guard this replaced would show
    // a second dialog for the same failure.
    void loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadData reads only storeId; intl is stable
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
  // the per-category max product order and prefills Orden with data+1.
  async function handleAddProduct(category: ProductCategory) {
    const maxOrderResult = await productService.getMaxOrderByCategoryId(category.id);
    setModal({ type: 'create', category, defaultOrder: (maxOrderResult.data ?? 0) + 1 });
  }

  // --- Add category (opens the create modal) ---
  // Angular parity (edit-product-category-modal.component.ts:37-39): create-mode prefills Orden
  // with the GLOBAL max category order + 1. Resolved here rather than inside the modal, matching
  // handleAddProduct above. This is not cosmetic: addProductCategoryData shifts every sibling
  // with `order >= order` by +1 (product-category-repository.ts:133-137), so the old hardcoded
  // `1` rewrote the order of EVERY existing category on each create. At max+1 that loop is a
  // no-op. Note the scope difference from handleAddProduct: this max is store-wide across all
  // categories, not per-category.
  async function handleAddCategory() {
    const maxOrderResult = await categoryService.getMaxOrder();
    setModal({ type: 'category', defaultOrder: (maxOrderResult.data ?? 0) + 1 });
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

    setModal(null);
    void loadData();
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

    setModal(null);
    void loadData();
  }

  // --- Deactivate product ---
  // catalog-show-all-and-clear-data §Finding 2: `ProductService.deleteProduct` is, and stays,
  // a SOFT delete — it sets isActive: false and the row stays in storage
  // (`packages/domain`'s `ProductService` interface is untouchable, so the call itself is
  // unchanged). Before the catalog started listing inactive rows, the isActive filter made the
  // row vanish, so calling it "eliminar" read as true. Now the row stays listed, dimmed and
  // badged "Inactivo", so it deactivates rather than removes — the label (and this handler's
  // name) were aligned to that behaviour instead of the other way around. The confirmation
  // copy is hardcoded Spanish rather than the SHARED GENERAL.DELETE_CONFIRM_TITLE/MESSAGE_A
  // keys: those keys' "eliminar" wording is depended on by three other screens
  // (today-entries.tsx, today-expenses.tsx, order-item-list.tsx) that genuinely delete/remove,
  // so they stay untouched and this screen gets its own copy instead.
  async function handleDeactivateProduct(id: string) {
    const confirmed = await confirmDialog({
      title: 'Confirmación para desactivar',
      message: '¿Está seguro que desea desactivar este producto?',
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;

    await productService.deleteProduct(id);

    setModal(null);
    void loadData();
  }

  // --- Activate product ---
  // Mirror of handleDeactivateProduct for an inactive catalog row. ProductService has NO
  // activateProduct (exact Angular parity surface, untouchable — see packages/domain
  // src/services/product-service.ts), so activation reuses updateProduct with isActive: true
  // and the product's own unchanged fields, including its stored barcode (unlike the edit
  // modal, which deliberately always sends undefined per Angular parity).
  async function handleActivateProduct(product: Product) {
    const confirmed = await confirmDialog({
      title: 'Confirmación para activar',
      message: '¿Está seguro que desea activar este producto?',
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;

    const result = await productService.updateProduct(
      product.id,
      product.categoryId,
      product.name,
      product.price,
      product.businessId,
      product.order,
      true,
      product.availableToSale,
      product.discountFromInvantory,
      product.barcode,
    );
    if (!result.succeeded) {
      showBlockingError(intl.formatMessage({ id: 'GENERAL.ERROR' }), result.errors[0]?.description ?? '');
      return;
    }

    setModal(null);
    void loadData();
  }

  // --- Bulk create (per-category "Nuevo Productos" -> bulk-CREATE, Angular parity) ---
  // Angular parity (edit-products-modal.component.ts:74-107): "Nuevo Productos" bulk-CREATES
  // new products (createProducts) — it never edits existing ones. Angular's onSubmit closes
  // the modal and emits the update event UNCONDITIONALLY (before checking `response.succeeded`);
  // the Swal error is purely informational when some names already existed.
  async function handleBulkSave(categoryId: string, items: { name: string; price: number }[]) {
    // `result.succeeded` is NOT a reason to stop here: Angular parity requires the modal to
    // close and the repaint to fire even when the bulk create partially failed, with the
    // error shown afterwards as information — see the Angular note above. The check stays
    // last for that reason, not by accident.
    const result = await productService.createProducts(categoryId, items);

    setModal(null);
    void loadData();
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

    setModal(null);
    void loadData();
  }

  // --- CSV import ---
  // Angular parity (product-offline.service.ts:74-84 createCsvProducts + csv-product.service.ts
  // validateProducts): category resolution/creation happens INSIDE createCsvProducts (per row,
  // by name). Rows without a category are filtered out here, mirroring Angular's
  // `validateProducts` (`item['category'] && item['name'] && price`). No barcode (Flag #2).
  // DIVERGES DELIBERATELY (decision #12, csv-import-cost-quantity-entries, 2026-08-04): after
  // `createCsvProducts` returns, this handler also creates one inventory entry per created row
  // carrying a qualifying quantity, via the same primitive as manual entry
  // (`InventoryOfflineService.createInventoryEntry`). The orchestration lives HERE, not inside
  // `ProductOfflineService` — sales must not depend on inventory at the service layer.
  //
  // 2026-09-02 ROW-LEVEL IMPORT RULE: every processed row lands in `created` (with its resolved
  // product id and an `existing` flag), so the handler now creates one inventory entry per row —
  // created OR reused — carrying a qualifying quantity. `createCsvProducts` already updated the
  // reused product's sale price, so the handler does NOT repeat it. There are no duplicate
  // failures, so the "ya existen" dialog is gone.
  async function handleCsvImport(rows: ParsedProductRow[]) {
    const csvProducts: CsvProduct[] = rows
      .filter((row) => row.category)
      .map((row) => ({
        category: row.category,
        name: row.name,
        price: row.price,
        cost: row.cost,
        quantity: row.quantity,
      }));

    const result = await productService.createCsvProducts(csvProducts);
    // createCsvProducts always resolves success(...) by design (ADR-1): failure() hardcodes
    // data:null (envelope.ts:19-27), which would destroy the {created,failed} payload. This ??
    // is TS narrowing on the BaseResponseModel union, NOT a runtime failure path.
    const { created } = result.data ?? { created: [] };

    const inventoryService = new InventoryOfflineService(
      storeId,
      new ProductRepository(storeId, new ProductCategoryRepository(storeId)),
    );

    let entriesCreated = 0;
    for (const product of created) {
      // Absent, 0, or negative -> no entry (decision #8). The parser PRESERVES 0/negative
      // quantities (REQ-1 sc.6/7) instead of collapsing them to undefined, so a bare
      // `!product.quantity` check is insufficient here: `!(-3)` is `false` in JS and would let
      // a negative-quantity row slip through to createInventoryEntry.
      if (!product.quantity || product.quantity <= 0) continue;
      const costPrice = product.cost ?? product.price; // decision #7/#16: 0 is a valid cost
      const entry = inventoryService.createInventoryEntry(product.id, product.quantity, costPrice);
      // R2: the primitive returns bare `null` (product not found) or a DataResult that may not
      // have succeeded — the optional chain absorbs both, so neither inflates the count. Same
      // idiom as today-entries.tsx:148.
      if (entry?.succeeded) entriesCreated++;
    }

    setModal(null);

    // The toast reports REAL successes (products created + entries created), unconditionally,
    // with no branching — even a legacy 3-column CSV reads "... y 0 entradas correctamente."
    // Both counts derive from the processed rows and the created entries; with the 2026-09-02
    // rule every row is processed (created or reused), so `created.length` equals the row count.
    // The string stays hardcoded Spanish (no i18n key), matching Angular's own and the
    // pre-existing React literal — introducing keys is out of scope (R6).
    showToastSuccess(`Importados ${created.length} productos y ${entriesCreated} entradas correctamente.`);

    void loadData();
  }

  // --- Clear all data ---
  // catalog-show-all-and-clear-data §D5/D6/D9, revised by §Finding 1. Wipes the six business
  // entities of the ACTIVE store; never touches token/AUTH_MODEL/currentUser/roster/DEK, so
  // the session survives and the device keeps offline access.
  //
  // The cart goes through the store's own clear() action rather than its
  // localStorage key: the key alone would leave the in-memory zustand copy
  // populated in this tab, which would then re-persist itself. Left behind, that
  // cart points at products that no longer exist and can still be checked out.
  //
  // clearStoreData cannot throw (it swallows per key), so a try/catch around it would guard
  // nothing and would report a failure that never happens. It instead RETURNS the entity names
  // it could not remove; that is the truth the wipe outranks. clearCart() and loadData() are
  // each a separate, genuinely-catchable concern — clearCart() is zustand's persist-middleware
  // clear(), which calls localStorage.setItem synchronously with no guard of its own, and
  // loadData() can throw via decryptEntity when no DEK is in memory. On an irreversible action,
  // telling the user their data is gone when a step downstream of the wipe silently failed is
  // the worst outcome this handler can produce, so each of the three concerns gets tracked
  // independently and exactly ONE message fires, checked in order of what matters most: the
  // wipe itself, then the cart (a stale cart can be sold from), then the repaint (cosmetic —
  // a reload fixes it).
  async function handleClearData() {
    const confirmed = await confirmDialog({
      title: '¿Está seguro que desea eliminar todos los datos?',
      message: 'Este proceso no se podrá revertir.',
      confirmButtonText: intl.formatMessage({ id: 'GENERAL.YES' }),
      cancelButtonText: intl.formatMessage({ id: 'GENERAL.NO' }),
    });
    if (!confirmed) return;

    const failedEntities = clearStoreData(storeId);

    let cartCleared = true;
    try {
      clearCart();
    } catch {
      cartCleared = false;
    }

    let repainted = true;
    try {
      await loadData();
    } catch {
      repainted = false;
    }

    if (failedEntities.length > 0) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        `No se pudieron eliminar todos los datos. Quedaron sin borrar: ${failedEntities.join(', ')}.`,
      );
      return;
    }

    if (!cartCleared) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        'Los datos fueron eliminados, pero no se pudo vaciar el carrito. Revíselo antes de vender.',
      );
      return;
    }

    if (!repainted) {
      showBlockingError(
        intl.formatMessage({ id: 'GENERAL.ERROR' }),
        'Los datos fueron eliminados, pero no se pudo actualizar la vista. Recargue la página.',
      );
      return;
    }

    showToastSuccess('Todos los datos fueron eliminados.');
  }

  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      <Card
        padding="tight"
        title={
          <div className="flex items-center justify-between">
            {/* PRODUCT.PRODUCTS */}
            <span>{intl.formatMessage({ id: 'PRODUCT.PRODUCTS' })}</span>
            <Button variant="fab" onClick={handleAddCategory} data-testid="add-category-button">
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

        <div className="flex justify-end gap-3 mb-4">
          {isOwner && (
            <Button variant="fab-danger" onClick={handleClearData} data-testid="clear-data-button">
              <TrashIcon />
              Limpiar
            </Button>
          )}
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
              <div
                key={category.id}
                className="rounded-lg border border-border bg-surface"
              >
                {/* Header row: name+count toggle the panel; a gear menu sits to the LEFT of
                    the chevron and exposes the category actions WITHOUT expanding — clicking
                    the gear must not toggle. The chevron is its own toggle button so the gear
                    can be a sibling (nested <button>s are invalid HTML).
                    The dim lives on the TOGGLE BUTTON (content), not the header row wrapper:
                    CSS opacity on a parent cannot be undone by a child, so putting it on the
                    wrapper would dim the CategoryActionsMenu gear AND its dropdown (they
                    render inside the header), making the menu look disabled and its options
                    unreadable — same trap as the product row menu. It would also stack with
                    an inactive PRODUCT row's own opacity-60 (0.6 x 0.6 = 0.36) and push the
                    "Inactivo" badge's text-danger below usable contrast — the one element that
                    must not be dimmed twice, since it is the affordance carrying the meaning
                    colour and opacity alone cannot. It is also more accurate: a category's own
                    products are not necessarily inactive just because the category is. */}
                <div className="flex w-full items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => togglePanel(category.id)}
                    className={`flex flex-1 items-center gap-3 text-left ${category.isActive ? '' : 'opacity-60'}`.trim()}
                    data-testid={`category-panel-toggle-${category.id}`}
                    aria-expanded={isExpanded}
                  >
                    <span className="flex-1 text-left text-base font-medium text-text">{category.name}</span>
                    {!category.isActive && <InactiveBadge />}
                    {/* productsCount is the category's TOTAL product count, resolved through the
                        SAME repository method as the panel's product list below — the badge and
                        the rows below can never disagree. */}
                    <span className="text-sm text-text-muted">{category.productsCount}</span>
                  </button>
                  <CategoryActionsMenu
                    category={category}
                    onEditCategory={() => setModal({ type: 'category', category, defaultOrder: category.order })}
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
                      onDeactivateProduct={handleDeactivateProduct}
                      onActivateProduct={handleActivateProduct}
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
          defaultOrder={modal.defaultOrder}
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
