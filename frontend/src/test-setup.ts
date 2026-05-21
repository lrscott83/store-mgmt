// Base Test Configuration for Angular Components
// Provides common dependencies needed across all component tests

import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { NgbActiveModal, NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { ProductService } from '../app/domain/interfaces/product.service';
import { ProductCategoryService } from '../app/domain/interfaces/product-category.service';
import { PRODUCT_SERVICE, PRODUCT_CATEGORY_SERVICE } from '../app/_services/tokens';

// Mock Product Service
const mockProductService = {
  getProducts: () => [],
  getProductById: () => null,
  getProductsByStore: () => [],
  saveProduct: () => null,
  deleteProduct: () => null
};

// Mock Product Category Service
const mockProductCategoryService = {
  getCategories: () => [],
  saveCategory: () => null
};

// Mock Translate Service
class MockTranslateService {
  instant(key: string): string {
    return key;
  }
  get(key: string) {
    return { subscribe: () => {} };
  }
}

// Toastr Config
export const toastrConfig = {
  timeOut: 3000,
  positionClass: 'toast-top-right',
  preventDuplicates: true
};

export const testProviders = [
  HttpClientTestingModule,
  RouterTestingModule,
  NgbModule,
  TranslateModule.forRoot().providers,
  {
    provide: PRODUCT_SERVICE,
    useValue: mockProductService
  },
  {
    provide: PRODUCT_CATEGORY_SERVICE,
    useValue: mockProductCategoryService
  },
  {
    provide: TranslateService,
    useClass: MockTranslateService
  },
  ToastrModule,
  {
    provide: ToastrService,
    useValue: {
      success: () => {},
      error: () => {},
      warning: () => {},
      info: () => {}
    }
  },
  NgbActiveModal
];
