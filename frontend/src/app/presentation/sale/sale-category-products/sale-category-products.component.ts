import { Component, Input } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { BehaviorSubject, catchError, Observable, Subscription } from 'rxjs';
import { ShoppingCartService } from 'src/app/_services/order/shopping-cart.service';
import { ProductOfflineService } from 'src/app/application/products/product-offline.service';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';
import { Product } from 'src/app/domain/entities/products/product.model';
import { SharedModule } from '../../shared/shared.module';
import Swal from 'sweetalert2';
import { InventoryOfflineService } from 'src/app/application/entries/inventory-offline.service';
import { Result } from 'src/app/domain/commons/result';
import { ProductErrors } from 'src/app/domain/entities/products/product.errors';
import { MessageService } from 'src/app/domain/interfaces/message.service';

@Component({
  selector: 'app-sale-category-products',
  standalone: true,
  imports: [SharedModule, TranslateModule],
  templateUrl: './sale-category-products.component.html',
  styleUrl: './sale-category-products.component.scss'
})
export class SaleCategoryProductsComponent {
  @Input() category: Observable<ProductCategory>;

  products$: BehaviorSubject<Product[]> = new BehaviorSubject<Product[]>([]);

  private unsubscribe: Subscription[] = [];

  constructor(private productService: ProductOfflineService, private shoppingCartService: ShoppingCartService, private translate: TranslateService, private toastrService: ToastrService, private inventoryService: InventoryOfflineService, private messageService: MessageService) { }

  ngOnInit(): void {
    const categorySubscription = this.category.subscribe(cat => {
      if (!cat)
        return;
      const productsSubscription = this.productService.getProductsToSaleByCategoryId(cat.id).subscribe(response => {
        if (response.succeeded) {
          this.products$.next(response.data);
        }
      });
      this.unsubscribe.push(productsSubscription);
    });
    this.unsubscribe.push(categorySubscription);
  }

  addProductToCart(productId: string) {
    const availableResult: Result = this.inventoryService.hasAvailableProductToSale(productId, 1);
    if (!availableResult.succeeded) {
      // TODO. Show confirm message y notificar al dueño de la tienda.
      const message = availableResult.errors && availableResult.errors.length > 0
        ? availableResult.errors[0].description
        : ProductErrors.ProductNotAvailable.description;
      Swal.fire({
        // title: this.translate.instant('SALES.CONFIRM_NOT_INVENTORY_AVAILABLE_TITLE'),
        // text: this.translate.instant('SALES.CONFIRM_NOT_INVENTORY_AVAILABLE_MESSAGE'),
        // icon: "question",
        title: this.translate.instant('GENERAL.RESPONSE.ERROR_TITLE'),
        text: this.translate.instant('SALES.NOT_INVENTORY_AVAILABLE_MESSAGE'),
        icon: "error",
        // showCancelButton: true,
        // confirmButtonColor: "#3456ff",
        // cancelButtonColor: "#dc3545",
        // confirmButtonText: this.translate.instant('GENERAL.CANCEL'),
        //cancelButtonText: this.translate.instant('GENERAL.NO'),
      // }).then((result) => {
      //   if (result.isConfirmed) {
      //     this.productService.setDiscountFromInvantory(productId, false)
      //       .pipe(catchError((error) => {
      //         // return of({
      //         //   data: null,
      //         //   succeeded: false,
      //         //   message: "",
      //         //   actionCode: 400,
      //         //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
      //         // });
      //         console.error("Error in setDiscountFromInvantory with id: " + productId, error);
      //         throw error;
      //       }))
      //       .subscribe(response => {
      //         if (response.succeeded && response.data) {
      //           this.messageService.sendUpdateAvailableProductToSaleMessage(productId);
      //           this.addCartItem(productId);
      //         }
      //         else
      //           console.log("Error in setDiscountFromInvantory with id: " + productId);
      //       });
      //   }
      });
    } else
      this.addCartItem(productId);

  }

  addCartItem(productId: string) {
    this.shoppingCartService.addCartItem(productId, 1).then(response => {
      if (response.succeeded) {
        // this.toastrService.success(
        //   this.translate.instant('SALES.PRODUCT_ADDED_TO_CART'));
      } else {
        const message = response.errors && response.errors.length > 0
          ? response.errors[0].description
          : this.translate.instant('SALES.PRODUCT_NOT_ADDED_TO_CART');
        Swal.fire({
          icon: "error",
          title: this.translate.instant('GENERAL.RESPONSE.ERROR_TITLE'),
          text: message,
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.unsubscribe.forEach((sb) => sb.unsubscribe());
  }
}
