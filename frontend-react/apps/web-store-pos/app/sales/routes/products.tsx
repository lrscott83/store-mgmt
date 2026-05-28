import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { Product, ProductCategory } from '@store-mgmt/domain';
import { EFeatures } from '@store-mgmt/domain';
import { featureLoader } from '~/auth/routes/loaders';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { ProductOfflineService } from '../lib/services/product-offline-service';
import { ProductCategoryOfflineService } from '../lib/services/product-category-offline-service';
import { CategoryProductList } from '../components/category-product-list';
import { CreateProductModal } from '../components/create-product-modal';
import { EditProductModal } from '../components/edit-product-modal';
import { EditProductsModal } from '../components/edit-products-modal';
import { EditProductCategoryModal } from '../components/edit-product-category-modal';
import { CsvProductImporterModal } from '../components/csv-product-importer-modal';

export const loader = featureLoader([EFeatures.Products]);

type Modal =
  | { type: 'create' }
  | { type: 'edit'; product: Product }
  | { type: 'bulk' }
  | { type: 'category'; category?: ProductCategory }
  | { type: 'csv' };

export function ProductsPage() {
  const intl = useIntl();
  const storeId = useAuthStore((s) => s.user?.selectedStoreId ?? '');

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
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
      createdDate: new Date(),
      createdByName: '',
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

  // --- Bulk edit ---
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
        createdDate: new Date(),
        createdByName: '',
      });
    }
    loadData();
    setModal(null);
  }

  const existingBarcodes = products.filter((p) => p.barcode).map((p) => p.barcode as string);

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">
          {intl.formatMessage({ id: 'PRODUCTS.TITLE' })}
        </h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setModal({ type: 'csv' })}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            data-testid="import-csv-button"
          >
            {intl.formatMessage({ id: 'PRODUCTS.IMPORT_CSV' })}
          </button>
          <button
            type="button"
            onClick={() => setModal({ type: 'bulk' })}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            data-testid="bulk-edit-button"
          >
            {intl.formatMessage({ id: 'PRODUCTS.BULK_EDIT' })}
          </button>
          <button
            type="button"
            onClick={() => setModal({ type: 'category' })}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            data-testid="add-category-button"
          >
            {intl.formatMessage({ id: 'PRODUCTS.CATEGORY.CREATE' })}
          </button>
          <button
            type="button"
            onClick={() => setModal({ type: 'create' })}
            className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-700"
            data-testid="create-product-button"
          >
            {intl.formatMessage({ id: 'PRODUCTS.CREATE' })}
          </button>
        </div>
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={intl.formatMessage({ id: 'GENERAL.SEARCH' })}
          className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-cyan-500"
          data-testid="products-search-input"
        />
      </div>

      {/* Product list */}
      <CategoryProductList
        categories={categories}
        products={products}
        searchQuery={searchQuery}
        onEdit={(product) => setModal({ type: 'edit', product })}
      />

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
          products={products.filter((p) => p.isActive)}
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
