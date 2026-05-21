// Base Test Configuration - Angular 21
// Import this in your component specs to get common providers

import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { ProductService } from '../domain/interfaces/product.service';
import { ProductCategoryService } from '../domain/interfaces/product-category.service';
import { PRODUCT_SERVICE, PRODUCT_CATEGORY_SERVICE } from '../../_services/tokens';

// Mock implementations
export const MockProductService: Partial<ProductService> = {
  getProducts: () => ({ subscribe: () => {} }) as any,
  getProductById: () => ({ subscribe: () => {} }) as any,
  getProductsByStore: () => ({ subscribe: () => {} }) as any,
  hasAnyAvailableToSaleProduct: () => ({ subscribe: () => {} }) as any
};

export const MockProductCategoryService: Partial<ProductCategoryService> = {
  getCategories: () => ({ subscribe: () => {} }) as any,
  getCategoriesByStore: () => ({ subscribe: () => {} }) as any
};

export class MockTranslateService {
  instant(key: string): string {
    return key;
  }
  get(key: string) {
    return { subscribe: () => {} };
  }
  setDefaultLang() {}
  use() {}
}

// Common providers for all tests
export const testProviders = [
  HttpClientTestingModule,
  RouterTestingModule,
  NgbModule,
  TranslateModule.forRoot().providers,
  { provide: PRODUCT_SERVICE, useValue: MockProductService },
  { provide: PRODUCT_CATEGORY_SERVICE, useValue: MockProductCategoryService },
  { provide: TranslateService, useClass: MockTranslateService },
  ToastrModule
];

// Helper function to configure TestBed with common providers
export async function configureTestbed(component: any) {
  return TestBed.configureTestingModule({
    imports: [component, ...testProviders.map((p) => (p instanceof Function ? p : []))].filter(Boolean)
  });
}
