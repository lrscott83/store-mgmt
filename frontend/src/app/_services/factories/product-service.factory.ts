import { inject } from '@angular/core';
import { GlobalConfig } from 'src/app/_shared/configs/global.config';
import { ProductService } from 'src/app/domain/interfaces/product.service';
import { ProductOfflineService } from 'src/app/application/products/product-offline.service';
import { ProductOnlineService } from 'src/app/application/products/product-online.service';

export function productServiceFactory(): ProductService {
  return GlobalConfig.USE_ONLINE_SERVICE
    ? inject(ProductOnlineService)
    : inject(ProductOfflineService);
}
