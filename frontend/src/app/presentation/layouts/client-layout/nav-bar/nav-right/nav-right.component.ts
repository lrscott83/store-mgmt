// angular import
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { Router, RouterModule } from '@angular/router';

// project import

// third party
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// icon
import { IconService } from '@ant-design/icons-angular';
import {
  BellOutline,
  SettingOutline,
  GiftOutline,
  MessageOutline,
  PhoneOutline,
  CheckCircleOutline,
  LogoutOutline,
  EditOutline,
  UserOutline,
  ProfileOutline,
  WalletOutline,
  QuestionCircleOutline,
  LockOutline,
  CommentOutline,
  UnorderedListOutline,
  ArrowRightOutline,
  GithubOutline,
  ShoppingCartOutline,
  PlusOutline,
  PlusCircleOutline,
  AimOutline,
  QuestionOutline,
  
} from '@ant-design/icons-angular/icons';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { Observable } from 'rxjs';
import { CartData } from 'src/app/_services/_models/order/cart-data.model';
import { CartItem } from 'src/app/_services/_models/order/cart-item.model';
import { ShoppingCartService } from 'src/app/_services/order/shopping-cart.service';
import { OrderOfflineService } from 'src/app/application/orders/order-offline.service';
import { SharedModule } from 'src/app/presentation/shared/shared.module';
import Swal from 'sweetalert2';
import { AuthService } from 'src/app/_services/services.index';

@Component({
  selector: 'app-nav-right',
  standalone: true,
  imports: [SharedModule, RouterModule, TranslateModule],
  templateUrl: './nav-right.component.html',
  styleUrls: ['./nav-right.component.scss']
})
export class NavRightComponent {
  @Input() styleSelectorToggle!: boolean;
  @Output() Customize = new EventEmitter();
  windowWidth: number;
  screenFull: boolean = true;

  cartData$: Observable<CartData>;

  constructor(private iconService: IconService, private shoppingCartService: ShoppingCartService, private orderService: OrderOfflineService, private translate: TranslateService, private toastrService: ToastrService, private authService: AuthService, private router: Router) {
    this.windowWidth = window.innerWidth;
    this.iconService.addIcon(
      ...[
        CheckCircleOutline,
        GiftOutline,
        MessageOutline,
        SettingOutline,
        PhoneOutline,
        LogoutOutline,
        UserOutline,
        EditOutline,
        ProfileOutline,
        QuestionCircleOutline,
        LockOutline,
        CommentOutline,
        UnorderedListOutline,
        ArrowRightOutline,
        BellOutline,
        GithubOutline,
        WalletOutline,
        ShoppingCartOutline,
        PlusOutline,
        PlusCircleOutline,
        AimOutline,
        QuestionOutline,
      ]
    );
    this.cartData$ = this.shoppingCartService.getCartData$();
  }

  getUserLogin(): string {
    return this.authService.currentUserValue?.login;
  }

  getUserFullName(): string {
    return this.authService.currentUserValue?.fullName;
  }

  logout() {
    this.authService.logout();
  }

  createOrder() {
    if (this.shoppingCartService.getItemsCount() === 0) {
      Swal.fire({
        title: this.translate.instant('GENERAL.INFORMATION'),
        text: this.translate.instant('SHOPPING_CART.DON_NOT_PAY_EMPTY_CART'),
        icon: "info",
        showCancelButton: false,
        confirmButtonColor: "#3456ff",
        cancelButtonColor: "#dc3545",
        confirmButtonText: this.translate.instant('GENERAL.OK')
      });
      return;
    }

    this.orderService.createOrder(this.shoppingCartService.getCartItems()).subscribe(response => {
      if (response.succeeded) {
        this.toastrService.success(
          this.translate.instant('SHOPPING_CART.ORDER_CREATED'),
          this.translate.instant('GENERAL.RESPONSE.SUCCESS_TITLE'));
          //this.generateFacture();
        this.shoppingCartService.clearCart();
      } else
        this.toastrService.success(
          this.translate.instant('SHOPPING_CART.ORDER_NOT_CREATED'),
          this.translate.instant('GENERAL.RESPONSE.ERROR'));
    });
  }

  generateFacture() {
    const doc = new jsPDF();
    // Datos del negocio
    const businessName = 'Mi Negocio';
    const businessAddress = 'Dirección del Negocio';

    // Datos del cliente
    const clientName = 'Nombre del Cliente';
    const clientID = 'Número de Identidad del Cliente';
    const clientAddress = 'Dirección del Cliente';

    // Detalles de los productos
    const cartItems: CartItem[] = this.shoppingCartService.getCartItems();

    // Calcular el total
    const totalAmount = cartItems.reduce((acc, cartItem) => acc + cartItem.price, 0);

    // Agregar datos del negocio
    doc.text(businessName, 10, 10);
    doc.text(businessAddress, 10, 20);

    // Agregar datos del cliente
    doc.text(`Cliente: ${clientName}`, 10, 40);
    doc.text(`Número de Identidad: ${clientID}`, 10, 50);
    doc.text(`Dirección: ${clientAddress}`, 10, 60);

    // Agregar tabla de detalles de productos
    (doc as any).autoTable({
      head: [['Nombre', 'Cantidad', 'Precio', 'Total']],
      body: cartItems.map(product => [product.name, product.quantity, product.price, product.quantity * product.price]),
      startY: 80
    });

    // Agregar total al final de la tabla
    const finalY = (doc as any).autoTable.previous.finalY;
    doc.text(`Total: ${totalAmount}`, 10, finalY + 10);

    // Obtener el PDF como un Blob
    const pdfBlob = doc.output('blob');

    // Crear un URL temporal para el Blob
    const pdfUrl = URL.createObjectURL(pdfBlob);

    // Abrir el PDF en una nueva pestaña
    window.open(pdfUrl);
  }

  openNotificationsHelpDialog() {
    
  }

  getItemsCount(): number {
    return this.shoppingCartService.getItemsCount();
  }

  getCartTotal(): number {
    return this.shoppingCartService.getCartTotal();
  }

  getProductLabel(): string {
    return this.translate.instant(this.getItemsCount() > 1 ? 'SHOPPING_CART.PRODUCTS_LABEL' : 'SHOPPING_CART.PRODUCT_LABEL');
  }

  getPriceLabel(): string {
    return this.translate.instant('GENERAL.PRICE');
  }

  decreaseProduct(productId: string) {
    this.shoppingCartService.decreaseCartItem(productId);
  }

  increaseProduct(productId: string) {
    this.shoppingCartService.increaseCartItem(productId);
  }

  getTranslation(key: string, param: string = null): Observable<string> {
    return this.translate.get(key, { value: param });
  }

  navigateToUrl(url: string) {
    this.router.navigateByUrl(url);
  }

  profile = [
    {
      icon: 'edit',
      //title: 'View Profile',
      title: this.translate.instant('PROFILE.EDIT_PROFILE'),
      url: '/profile/edit',
    },
    {
      icon: 'lock',
      //title: 'View Profile',
      title: this.translate.instant('PROFILE.CHANGE_PASSWORD'),
      url: '/profile/change-password',
    },
    // {
    //   icon: 'user',
    //   title: 'View Profile'
    // },
    // {
    //   icon: 'profile',
    //   title: 'Social Profile'
    // },
    // {
    //   icon: 'wallet',
    //   title: 'Billing'
    // }
  ];

  setting = [
    {
      icon: 'question-circle',
      title: 'Support'
    },
    {
      icon: 'user',
      title: 'Account Settings'
    },
    {
      icon: 'lock',
      title: 'Privacy Center'
    },
    {
      icon: 'comment',
      title: 'Feedback'
    },
    {
      icon: 'unordered-list',
      title: 'History'
    }
  ];
}
