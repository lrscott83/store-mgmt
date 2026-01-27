// angular import
import { NgModule, isDevMode, inject, provideAppInitializer } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
// import { BrowserAnimationsModule, provideAnimations } from '@angular/platform-browser/animations';

// project import
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SharedModule } from './presentation/shared/shared.module';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptors } from '@angular/common/http';
import { BlockUIModule } from 'ng-block-ui';
import { TranslateModule } from '@ngx-translate/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { InterceptorService } from './_interceptors/interceptor.service';
import { ErrorInterceptor } from './_interceptors/error-interceptor.service';
import { AppInitService } from './_services/app-init.service';
import { InlineSVGModule } from 'ng-inline-svg-w';
import { provideToastr, ToastrModule } from 'ngx-toastr';
import { NgHttpLoaderComponent, pendingRequestsInterceptor$ } from 'ng-http-loader';
// import { AngularSlickgridModule } from 'angular-slickgrid';
import { provideEnvironmentNgxMask } from 'ngx-mask';
//import { ConnectionInterceptor } from './_interceptors/connection-interceptor.service';
import { ServiceWorkerModule } from '@angular/service-worker';
import { ProductCategoryOnlineService } from './application/categories/product-category-online.service';
import { ProductCategoryOfflineService } from './application/categories/product-category-offline.service';
import { productCategoryServiceFactory } from './_services/factories/product-category-service.factory';
import { PRODUCT_CATEGORY_SERVICE, PRODUCT_SERVICE } from './_services/tokens';
import { ProductOfflineService } from './application/products/product-offline.service';
import { ProductOnlineService } from './application/products/product-online.service';
import { productServiceFactory } from './_services/factories/product-service.factory';

// function appInitializer(authService: AuthService): Promise<void> {
//   return new Promise((resolve) => {
//     authService.getUserByToken().subscribe().add(resolve);
//   });
// }

export function initializeApp(appInitService: AppInitService) {
  return (): Promise<any> => {
    return appInitService.Init();
  }
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    ServiceWorkerModule.register('ngsw-worker.js', {
      //enabled: !isDevMode(),
      enabled: true,
      registrationStrategy: 'registerWhenStable:30000'
    }),
    BrowserModule,
    //HttpClientModule,
    AppRoutingModule,
    SharedModule,
    //BrowserAnimationsModule,
    TranslateModule.forRoot({
      defaultLanguage: 'es'
    }),
    InlineSVGModule.forRoot(),
    NgbModule,
    ToastrModule.forRoot({
      closeButton: true, // Muestra botón de cerrar [[2]]
      timeOut: 1000, // Duración por defecto (1 segundos)
      positionClass: 'toast-top-right', // Posición inicial [[6]]
      preventDuplicates: true // Evita mensajes duplicados
    }),
    BlockUIModule.forRoot({
      delayStart: 0,
      delayStop: 500,
      message: 'Cargando'
    }),
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(),
      // Register the ServiceWorker as soon as the application is stable
      // or after 30 seconds (whichever comes first).
      registrationStrategy: 'registerWhenStable:30000'
    }), // Import BlockUIModule
    // BlockUIHttpModule.forRoot({
    //   requestFilters: [/* urls added here won't be blocked*/]
    // }),
    NgHttpLoaderComponent
  ],
  providers: [
    //provideRouter(routes),
    //provideHttpClient(),
    provideHttpClient(withInterceptors([pendingRequestsInterceptor$])),
    // importProvidersFrom(AngularSlickgridModule.forRoot()),
    AppInitService,
    provideEnvironmentNgxMask(),
    //provideAnimations(), // required animations providers
    provideToastr(), // Toastr providers
    provideAppInitializer(() => {
        const initializerFn = (initializeApp)(inject(AppInitService));
        return initializerFn();
      }),
    {
      provide: HTTP_INTERCEPTORS,
      useClass: InterceptorService,
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
      useFactory: productCategoryServiceFactory,
    },
    ProductOfflineService,
    ProductOnlineService,
    {
      provide: PRODUCT_SERVICE,
      useFactory: productServiceFactory,
    },
    
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
