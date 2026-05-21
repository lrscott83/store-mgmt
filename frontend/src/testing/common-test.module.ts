// Common Test Module with Mocks
// Import this in your component specs: imports: [CommonTestModule, YourComponent]

import { NgModule } from '@angular/core';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule, TranslateService, TranslateLoader, MissingTranslationHandler } from '@ngx-translate/core';
import { ToastrModule, ToastrService } from 'ngx-toastr';
import { NgbModule, NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { provideNgxMask } from 'ngx-mask';
import { provideAnimations } from '@angular/platform-browser/animations';
import { PRODUCT_SERVICE, PRODUCT_CATEGORY_SERVICE } from '../app/_services/tokens';
import { AuthService } from '../app/_services/auth/auth.service';
import { StorageService } from '../app/_services/storage/storage.service';

class MockTranslateLoader implements TranslateLoader {
  getTranslation(lang: string): Observable<any> {
    return of({});
  }
}

class MockMissingTranslationHandler {
  handle(params: any) {
    return params.key;
  }
}

const mockUser = {
  id: 'test-user-id',
  login: 'testuser',
  fullName: 'Test User',
  email: 'test@test.com',
  cellPhone: '1234567890',
  isOwnerAdmin: true,
  isReSeller: false,
  isSuperAdmin: false,
  isActive: true,
  selectedStoreId: 'test-store-id',
  featureIds: [20, 21, 22, 23, 30, 31, 32, 33, 34, 35],
  storeModuleIds: [2, 3, 4, 5, 6, 7],
  authToken: 'test-token',
  expiresIn: new Date(Date.now() + 86400000),
  roles: [{ storeId: 'test-store-id', featureIds: [20, 21, 22] }]
};

class MockAuthService {
  currentUser$ = new BehaviorSubject(mockUser).asObservable();
  currentUserValue = mockUser;
  currentUser() {
    return mockUser;
  }
  isLoggedIn() {
    return true;
  }
  getAuthToken() {
    return 'test-token';
  }
  getUser() {
    return of(mockUser);
  }
  getCurrentUserDefaultUrl() {
    return '/sales/sale';
  }
  logout() {}
  login() {
    return of(mockUser);
  }
}

class MockStorageService {
  getCurrentUser() {
    return mockUser;
  }
  getSelectedStoreId() {
    return 'test-store-id';
  }
  getData(key: string) {
    return null;
  }
  setData(key: string, value: any) {}
}

class MockProductService {
  getProducts() {
    return of([]);
  }
  getProductById() {
    return of(null);
  }
  getProductsByStore() {
    return of([]);
  }
  saveProduct() {
    return of({});
  }
  deleteProduct() {
    return of({});
  }
  hasAnyAvailableToSaleProduct() {
    return of(true);
  }
  getProductCategoriesView() {
    return of({ succeeded: true, data: [] });
  }
  getAvailableProductCategories() {
    return of([]);
  }
  getMaxOrder() {
    return of(0);
  }
  getProductsToSelect() {
    return of({ succeeded: true, data: [] });
  }
  getProductsToSaleByCategoryId() {
    return of({ succeeded: true, data: [] });
  }
}

class MockProductCategoryService {
  getCategories() {
    return of([]);
  }
  getCategoriesByStore() {
    return of([]);
  }
  saveCategory() {
    return of({});
  }
  getAvailableProductCategories() {
    return of([]);
  }
  getMaxOrder() {
    return of(0);
  }
  getProductCategoriesView() {
    return of({ succeeded: true, data: [] });
  }
}

class MockToastrService {
  success() {}
  error() {}
  warning() {}
  info() {}
}

@NgModule({
  imports: [
    HttpClientTestingModule,
    RouterTestingModule,
    ReactiveFormsModule,
    FormsModule,
    ToastrModule.forRoot(),
    NgbModule,
    TranslateModule.forRoot({
      loader: { provide: TranslateLoader, useClass: MockTranslateLoader },
      missingTranslationHandler: { provide: MissingTranslationHandler, useClass: MockMissingTranslationHandler },
      defaultLanguage: 'es'
    })
  ],
  providers: [
    { provide: PRODUCT_SERVICE, useClass: MockProductService },
    { provide: PRODUCT_CATEGORY_SERVICE, useClass: MockProductCategoryService },
    { provide: ToastrService, useClass: MockToastrService },
    { provide: AuthService, useClass: MockAuthService },
    { provide: 'StorageService', useClass: MockStorageService },
    provideAnimations(),
    provideNgxMask(),
    NgbActiveModal
  ]
})
export class CommonTestModule {}
