// angular import
import { NgModule, inject, provideAppInitializer } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
// import { BrowserAnimationsModule, provideAnimations } from '@angular/platform-browser/animations';

// project import
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SharedModule } from './presentation/shared/shared.module';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { BlockUIModule } from 'ng-block-ui';
import { TranslateModule } from '@ngx-translate/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { InterceptorService } from './_interceptors/interceptor.service';
import { ErrorInterceptor } from './_interceptors/error-interceptor.service';
import { AppInitService } from './_services/app-init.service';
import { InlineSVGModule } from 'ng-inline-svg-w';
import { provideToastr, ToastrModule } from 'ngx-toastr';
import { LoadingInterceptor } from './_interceptors/loading-interceptor.service';
// import { AngularSlickgridModule } from 'angular-slickgrid';
import { provideEnvironmentNgxMask } from 'ngx-mask';
//import { ConnectionInterceptor } from './_interceptors/connection-interceptor.service';
import { ProductCategoryOnlineService } from './application/categories/product-category-online.service';
import { ProductCategoryOfflineService } from './application/categories/product-category-offline.service';
import { productCategoryServiceFactory } from './_services/factories/product-category-service.factory';
import { PRODUCT_CATEGORY_SERVICE, PRODUCT_SERVICE } from './_services/tokens';
import { ProductOfflineService } from './application/products/product-offline.service';
import { ProductOnlineService } from './application/products/product-online.service';
import { productServiceFactory } from './_services/factories/product-service.factory';
import { ServiceWorkerModule } from '@angular/service-worker';

export function initializeApp(appInitService: AppInitService) {
  return (): Promise<any> => {
    return appInitService.Init();
  };
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    AppRoutingModule,
    SharedModule,
    TranslateModule.forRoot({
      defaultLanguage: 'es'
    }),
    InlineSVGModule.forRoot(),
    NgbModule,
    ToastrModule.forRoot({
      closeButton: true,
      timeOut: 1000,
      positionClass: 'toast-top-right',
      preventDuplicates: true
    }),
    BlockUIModule.forRoot({
      delayStart: 0,
      delayStop: 500,
      message: 'Cargando'
    }),
    ServiceWorkerModule.register('/ngsw-worker.js', {
      enabled: true,
      registrationStrategy: 'registerWithDelay:5000'
    })
  ],
  providers: [
    //provideRouter(routes),
    //provideHttpClient(),
    provideHttpClient(withInterceptorsFromDi()),
    // importProvidersFrom(AngularSlickgridModule.forRoot()),
    AppInitService,
    provideEnvironmentNgxMask(),
    //provideAnimations(), // required animations providers
    provideToastr(), // Toastr providers
    provideAppInitializer(() => {
      const initializerFn = initializeApp(inject(AppInitService));
      return initializerFn();
    }),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: InterceptorService,
      multi: true
    },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: LoadingInterceptor,
      multi: true
    },
    // {
    //   provide: HTTP_INTERCEPTORS,
    //   useClass: ToastInterceptor,
    //   multi: true
    // },
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ErrorInterceptor,
      multi: true
    },
    // {
    //   provide: HTTP_INTERCEPTORS,
    //   useClass: ConnectionInterceptor,
    //   multi: true
    // },
    ProductCategoryOnlineService,
    ProductCategoryOfflineService,
    {
      provide: PRODUCT_CATEGORY_SERVICE,
      useFactory: productCategoryServiceFactory
    },
    ProductOfflineService,
    ProductOnlineService,
    {
      provide: PRODUCT_SERVICE,
      useFactory: productServiceFactory
    }
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
