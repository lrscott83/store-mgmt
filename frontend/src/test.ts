// Angular Test Setup with Global Mocks
// This file is loaded before any test runs

import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ToastrModule } from 'ngx-toastr';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { InjectionToken } from '@angular/core';

// Initialize Angular testing environment
getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());

// Define PRODUCT_SERVICE and PRODUCT_CATEGORY_SERVICE tokens (duplicated from app)
export const PRODUCT_SERVICE = new InjectionToken<any>('PRODUCT_SERVICE');
export const PRODUCT_CATEGORY_SERVICE = new InjectionToken<any>('PRODUCT_CATEGORY_SERVICE');

// Mock services
const mockProductService = {
  getProducts: () => ({ subscribe: () => {} }),
  getProductById: () => ({ subscribe: () => {} }),
  getProductsByStore: () => ({ subscribe: () => {} }),
  saveProduct: () => ({ subscribe: () => {} }),
  deleteProduct: () => ({ subscribe: () => {} }),
  hasAnyAvailableToSaleProduct: () => ({ subscribe: () => {} })
};

const mockProductCategoryService = {
  getCategories: () => ({ subscribe: () => {} }),
  getCategoriesByStore: () => ({ subscribe: () => {} }),
  saveCategory: () => ({ subscribe: () => {} })
};

const mockTranslateService = {
  instant: (key: string) => key,
  get: () => ({ subscribe: () => {} }),
  setDefaultLang: () => {},
  use: () => {}
};

const mockToastrService = {
  success: () => {},
  error: () => {},
  warning: () => {},
  info: () => {}
};

// These providers are automatically available via TestBed.configureTestingModule in each spec
// Import this file to have zone.js and basic environment set up
