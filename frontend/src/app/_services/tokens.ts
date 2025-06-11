import { InjectionToken } from '@angular/core';
import { ProductCategoryService } from '../application/categories/product-category.service';
import { ProductService } from '../domain/interfaces/product.service';

export const PRODUCT_CATEGORY_SERVICE = new InjectionToken<ProductCategoryService>('PRODUCT_CATEGORY_SERVICE');
export const PRODUCT_SERVICE = new InjectionToken<ProductService>('PRODUCT_SERVICE');
