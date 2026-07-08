import type { AuditableBaseModel } from './base';

export interface ProductCategory {
  id: string;
  name: string;
  order: number;
  isActive: boolean;
}

export interface ProductCategoryView extends ProductCategory {
  productsCount: number;
}

export interface Product extends AuditableBaseModel {
  id: string;
  name: string;
  barcode?: string;
  categoryId: string;
  categoryName: string;
  price: number;
  order: number;
  availableToSale: boolean;
  discountFromInvantory: boolean;
  businessId: string;
}

/**
 * 1:1 port of Angular's `ProductSelectView`
 * (application/products/product-select.view.ts) — the flattened shape
 * `ProductService.getProductsToSelect()` returns for dropdown/select UIs.
 */
export interface ProductSelectView {
  id: string;
  fullName: string;
}
