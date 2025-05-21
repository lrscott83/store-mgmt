import { Component, Input } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Product } from 'src/app/domain/entities/products/product.model';
import { SharedModule } from '../../shared/shared.module';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RegExExtensions } from 'src/app/_helpers/extensions/regex-extension';
import Swal from 'sweetalert2';
import { ShoppingCartService } from 'src/app/_services/order/shopping-cart.service';
import { Result } from 'src/app/domain/commons/result';
import { ProductErrors } from 'src/app/domain/entities/products/product.errors';
import { InventoryOfflineService } from 'src/app/application/entries/inventory-offline.service';

@Component({
  selector: 'app-sale-product-row',
  standalone: true,
  imports: [SharedModule, TranslateModule],
  templateUrl: './sale-product-row.component.html',
  styleUrl: './sale-product-row.component.scss'
})
export class SaleProductRowComponent {
  @Input() product: Product;

  formGroup: FormGroup;
  formPatterns: any;

  constructor(private formBuilder: FormBuilder, private shoppingCartService: ShoppingCartService, private translate: TranslateService, private inventoryService: InventoryOfflineService) {
    this.loadForm();
  }

  addProductToCart(productId: string) {
    const quantity: number = this.formGroup.value.quantity;
    const shoppingCartQty: number = this.shoppingCartService.getCartItemQuantity(productId);
    const availableResult: Result = this.inventoryService.hasAvailableProductToSale(productId, quantity + shoppingCartQty);
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
        text: message,
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
    this.shoppingCartService.addCartItem(productId, this.formGroup.value.quantity).then(response => {
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

  loadForm() {
    this.loadPatterns();
    this.formGroup = this.formBuilder.group({
      quantity: [{ value: "", disabled: false }, Validators.compose([
        Validators.required,
        Validators.pattern(this.formPatterns.number.regex)])],
    });
    this.formGroup.patchValue({ quantity: 1 });
  }

  loadPatterns() {
    this.formPatterns = {
      number: {
        regex: RegExExtensions.numeric,
        mask: "0",
      }
    };
  }

  patterns(controlName: string): any {
    return this.formPatterns[controlName].pattern;
  }

  mask(controlName: string): any {
    return this.formPatterns[controlName].mask;
  }

  // helpers for View
  isControlInvalid(controlName: string, validator: string): boolean {
    const control = this.formGroup.controls[controlName];
    if (validator == "") {
      return control.hasError('required') && (control.dirty || control.touched);
    } else {
      return control.hasError(validator) && (control.dirty || control.touched);
    }
  }
}
