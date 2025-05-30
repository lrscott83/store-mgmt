import { InjectionToken } from '@angular/core';
import { ProductCategoryService } from '../application/categories/product-category.service';

export const PRODUCT_CATEGORY_SERVICE = new InjectionToken<ProductCategoryService>('PRODUCT_CATEGORY_SERVICE');
