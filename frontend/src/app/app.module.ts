// angular import
import { APP_INITIALIZER, NgModule, importProvidersFrom, isDevMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule, provideAnimations } from '@angular/platform-browser/animations';

// project import
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SharedModule } from './presentation/shared/shared.module';
import { HTTP_INTERCEPTORS, HttpClientModule, provideHttpClient } from '@angular/common/http';
import { BlockUIModule } from 'ng-block-ui';
import { TranslateModule } from '@ngx-translate/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { HIGHLIGHT_OPTIONS, HighlightModule } from 'ngx-highlightjs';
import { InterceptorService } from './_interceptors/interceptor.service';
import { ErrorInterceptor } from './_interceptors/error-interceptor.service';
import { AppInitService } from './_services/app-init.service';
import { InlineSVGModule } from 'ng-inline-svg-w';
import { provideToastr, ToastrModule } from 'ngx-toastr';
import { NgHttpLoaderModule } from 'ng-http-loader';
import { provideRouter } from '@angular/router';
// import { AngularSlickgridModule } from 'angular-slickgrid';
import { provideEnvironmentNgxMask } from 'ngx-mask';
import { ConnectionInterceptor } from './_interceptors/connection-interceptor.service';
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
    BrowserModule,
    HttpClientModule,
    NgHttpLoaderModule.forRoot(),
    AppRoutingModule,
    SharedModule,
    BrowserAnimationsModule,
    HighlightModule,

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
  ],
  providers: [
    //provideRouter(routes),
    provideHttpClient(),
    importProvidersFrom(NgHttpLoaderModule.forRoot()), //<== Always call `forRoot`
    // importProvidersFrom(AngularSlickgridModule.forRoot()),
    AppInitService,
    provideEnvironmentNgxMask(),
    provideAnimations(), // required animations providers
    provideToastr(), // Toastr providers
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      multi: true,
      deps: [AppInitService],
    },
    {
      provide: HIGHLIGHT_OPTIONS,
      useValue: {
        coreLibraryLoader: () => import('highlight.js/lib/core'),
        languages: {
          xml: () => import('highlight.js/lib/languages/xml'),
          typescript: () => import('highlight.js/lib/languages/typescript'),
          scss: () => import('highlight.js/lib/languages/scss'),
          json: () => import('highlight.js/lib/languages/json')
        },
      },
    },
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
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ConnectionInterceptor,
      multi: true
    },
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
