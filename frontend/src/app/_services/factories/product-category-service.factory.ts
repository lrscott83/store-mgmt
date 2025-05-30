import { inject } from '@angular/core';
import { ProductCategoryService } from 'src/app/application/categories/product-category.service';
import { ProductCategoryOnlineService } from 'src/app/application/categories/product-category-online.service';
import { ProductCategoryOfflineService } from 'src/app/application/categories/product-category-offline.service';
import { GlobalConfig } from 'src/app/_shared/configs/global.config';

export function productCategoryServiceFactory(): ProductCategoryService {
  return GlobalConfig.USE_ONLINE_SERVICE
    ? inject(ProductCategoryOnlineService)
    : inject(ProductCategoryOfflineService);
}
