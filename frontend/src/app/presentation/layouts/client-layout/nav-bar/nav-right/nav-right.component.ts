// angular import
import { Component, Input, Output, EventEmitter, ViewChild, ViewEncapsulation } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
import { ProductErrors } from 'src/app/domain/entities/products/product.errors';
import { DatosVenta, Order, OrderType, OrderTypeUtils } from 'src/app/domain/entities/orders/order.model';
import { NgbDropdown, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { EditOrderDetailsModalComponent } from '../edit-order-details-modal/edit-order-details-modal.component';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { AuthorizationService } from 'src/app/_services/authorization/authorization.service';
import { PaymentType, PaymentTypeUtils } from 'src/app/domain/commons/payment-type';
import { TypeData } from 'src/app/domain/commons/type-data';

@Component({
  selector: 'app-nav-right',
  standalone: true,
  imports: [SharedModule, RouterModule, TranslateModule, EditOrderDetailsModalComponent],
  templateUrl: './nav-right.component.html',
  styleUrls: ['./nav-right.component.scss'],
  //encapsulation: ViewEncapsulation.None,
})
export class NavRightComponent {
  @Input() styleSelectorToggle!: boolean;
  @Output() Customize = new EventEmitter();

  @ViewChild('cartDropdown', { static: false }) cartDropdown!: NgbDropdown;

  currentUser: UserModel;
  hasCreditsModuleAvailable: boolean;

  paymentType: PaymentType = PaymentType.Efectivo;
  paymentTypes: TypeData[] = PaymentTypeUtils.getPaymentTypes();

  payment: number;

  windowWidth: number;
  screenFull: boolean = true;

  cartData$: Observable<CartData>;
  mustGenerateFacture: boolean = false;
  isCredit: boolean = false;
  client: string = "";

  orderType: OrderType = OrderType.Normal;

  constructor(private iconService: IconService, private shoppingCartService: ShoppingCartService, private orderService: OrderOfflineService, private translate: TranslateService, private toastrService: ToastrService, private authService: AuthService, private router: Router, private modalService: NgbModal, private authorizationService: AuthorizationService) {
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
    this.currentUser = this.authService.currentUserValue;
    this.hasCreditsModuleAvailable = this.authorizationService.hasCreditsModuleAvailable();
  }

  closeCartDropdown() {
    this.cartDropdown.close();
  }

  getPaymentTypeIcon(paymentType: PaymentType) {
    return PaymentTypeUtils.getPaymentTypeIcon(paymentType);
  }

  navigateToHelp() {

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

  getPaymentReturn(): number {
    return this.payment ? this.payment - this.shoppingCartService.getCartTotal() : 0;
  }

  getPaymentReturnClass(): string {
    if (this.getPaymentReturn() > 0)
      return "payment-return-positive";
    return this.getPaymentReturn() < 0 ? "payment-return-negative" : "";
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

    if (this.payment && this.payment < this.shoppingCartService.getCartTotal()) {
      Swal.fire({
        title: this.translate.instant('GENERAL.INFORMATION'),
        text: this.translate.instant('SHOPPING_CART.DON_NOT_PAY_LESS_THAN_CART_TOTAL'),
        icon: "info",
        showCancelButton: false,
        confirmButtonColor: "#3456ff",
        cancelButtonColor: "#dc3545",
        confirmButtonText: this.translate.instant('GENERAL.OK')
      });
      return;
    }

    if (this.isCredit && !this.client) {
      Swal.fire({
        title: this.translate.instant('GENERAL.INFORMATION'),
        text: this.translate.instant('SHOPPING_CART.DON_NOT_SALE_CREDIT_WITHOUT_CLIENT'),
        icon: "info",
        showCancelButton: false,
        confirmButtonColor: "#3456ff",
        cancelButtonColor: "#dc3545",
        confirmButtonText: this.translate.instant('GENERAL.OK')
      });
      return;
    }

    this.orderService.createOrder(this.shoppingCartService.getCartItems(), this.shoppingCartService.getOrderType(), this.isCredit, this.paymentType, this.shoppingCartService.getOrderDescription(), this.client).subscribe(response => {
      if (response.succeeded && response.data) {
        this.toastrService.success(
          this.translate.instant('SHOPPING_CART.ORDER_CREATED'),
          this.translate.instant('GENERAL.RESPONSE.SUCCESS_TITLE'));
        if (this.mustGenerateFacture) {
          //this.generateFacture();
          this.generateTicket(response.data);
        }
        this.clearShoppingCart();
      } else
        this.toastrService.error(
          this.translate.instant('SHOPPING_CART.ORDER_NOT_CREATED'),
          this.translate.instant('GENERAL.RESPONSE.ERROR'));
    });
  }

  clearShoppingCart() {
    this.shoppingCartService.clearCart();
    this.orderType = OrderType.Normal;
    this.paymentType = PaymentType.Efectivo;
    this.payment = null;
    this.client = "";
    this.isCredit = false;
    this.closeCartDropdown();
  }

  generateTicket(order: Order) {
    // Detalles de los productos
    const cartItems: CartItem[] = this.shoppingCartService.getCartItems();

    // Calcular el total
    const totalAmount = cartItems.reduce((acc, cartItem) => acc + cartItem.price, 0);

    const doc = new jsPDF({
      unit: 'mm',
      format: [80, 120 + cartItems.length * 8], // altura dinámica
    });

    let y = 10;

    const addText = (text: string, x = 10, fontSize = 10) => {
      doc.setFontSize(fontSize);
      doc.text(text, x, y);
      y += 5;
    };

    addText('*** VENTA ***', 20, 12);
    addText(`Folio: ${order.id}`);
    addText(`Fecha: ${format(order.date, 'dd/MM/yyyy', { locale: es })}`);
    addText(`Status: ${order.isCredit ? 'Por Cobrar' : 'Pagado'}`);
    addText(`Forma de Pago: ${PaymentTypeUtils.getPaymentTypeText(order.paymentType)}`);
    y += 3;
    doc.line(5, y, 75, y); y += 4;

    cartItems.forEach(p => {
      addText(`${p.name}`);
      addText(`${p.quantity} x $${this.formatoPrecio(p.price)} -> $${this.formatoPrecio(p.quantity * p.price)}`);
      y += 2;
    });

    doc.line(5, y, 75, y); y += 4;
    addText(`Total $: ${this.formatoPrecio(totalAmount)}`);
    addText(`Pagos: $${this.formatoPrecio(order.isCredit ? 0 : totalAmount)}`);
    addText(`Deuda: ${this.formatoPrecio(order.isCredit ? totalAmount : 0)}`);

    // ⬇️ Imprimir automáticamente
    //doc.autoPrint();

    // Abrir en nueva pestaña para que se dispare el diálogo de impresión
    // const printWindow = window.open('', '_blank');
    // if (printWindow) {
    //   printWindow.document.write(`<html><head><title>Ticket</title></head><body></body></html>`);
    //   const pdfBlob = doc.output('blob');
    //   const pdfUrl = URL.createObjectURL(pdfBlob);
    //   printWindow.location.href = pdfUrl;
    // }

    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);

    this.openPrintPopup(pdfUrl);

    // // Abrir en popup
    // const popup = window.open("", "_blank", "width=800,height=600");

    // if (popup) {
    //   popup.document.write(`
    //   <html>
    //     <head>
    //       <title>Vista previa</title>
    //     </head>
    //     <body style="margin:0">
    //       <embed src="${pdfUrl}" type="application/pdf" width="100%" height="100%" />
    //       <script>
    //         window.onload = function() {
    //           setTimeout(function(){
    //             window.print();
    //           }, 500);
    //           window.onafterprint = function() {
    //             window.close();
    //           };
    //         };
    //       </script>
    //     </body>
    //   </html>
    // `);
    //   popup.document.close();
    // }
  }

  openPrintPopup(pdfUrl: string) {
    // Crear ventana emergente
    const printWindow = window.open('', '_blank', 'width=800,height=600,toolbar=0,location=0');

    if (!printWindow) {
      alert('Por favor permite ventanas emergentes para imprimir');
      return;
    }

    // HTML para el popup con el PDF
    printWindow.document.write(`
    <html>
      <head>
        <title>Imprimir factura</title>
        <style>
          body { margin: 0; }
          iframe { width: 100%; height: 100vh; border: none; }
        </style>
      </head>
      <body>
        <iframe src="${pdfUrl}"></iframe>
      </body>
    </html>
  `);

    // Esperar a que cargue el PDF
    const iframe = printWindow.document.querySelector('iframe');
    iframe?.addEventListener('load', () => {
      // Abrir diálogo de impresión
      printWindow.focus();
      printWindow.print();
    });

    // Evento para cerrar después de imprimir
    printWindow.addEventListener('afterprint', () => {
      printWindow.close();
      URL.revokeObjectURL(pdfUrl);  // Liberar memoria
    });
  }

  // generateTicket(venta: DatosVenta) {
  //   const doc = new jsPDF({
  //     unit: 'mm',
  //     format: [80, 120 + venta.productos.length * 8], // altura dinámica
  //   });

  //   let y = 10;

  //   const addText = (text: string, x = 10, fontSize = 10) => {
  //     doc.setFontSize(fontSize);
  //     doc.text(text, x, y);
  //     y += 5;
  //   };

  //   addText('*** VENTA ***', 20, 12);
  //   addText(`Folio: ${venta.folio}`);
  //   addText(`Fecha: ${venta.fecha}`);
  //   addText(`Status: ${venta.status}`);
  //   addText(`Forma de Pago: ${venta.formaPago}`);
  //   y += 3;
  //   doc.line(5, y, 75, y); y += 4;

  //   venta.productos.forEach(p => {
  //     addText(`${p.nombre}`);
  //     addText(`${p.cantidad} x $${this.formatoPrecio(p.precioUnitario)} -> $${this.formatoPrecio(p.subtotal)}`);
  //     y += 2;
  //   });

  //   doc.line(5, y, 75, y); y += 4;
  //   addText(`Total $: ${this.formatoPrecio(venta.total)}`);
  //   addText(`Pagos: $${this.formatoPrecio(venta.pagos)}`);
  //   addText(`Deuda: ${this.formatoPrecio(venta.deuda)}`);

  //   doc.save(`ticket_${venta.folio}.pdf`);
  // }

  private formatoPrecio(valor: number): string {
    return valor.toLocaleString('es-VE', { minimumFractionDigits: 0 });
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

    /// Abrir el PDF en una nueva pestaña (si el navegador lo permite)
    const newTab = window.open(pdfUrl, '_blank');

    // Si el navegador bloquea el popup, puedes dar una alternativa
    if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
      alert('El visor de PDF fue bloqueado. Por favor, permite ventanas emergentes.');
    }
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
    this.shoppingCartService.decreaseCartItem(productId).then(response => {
      if (response.succeeded)
        return;
      const message = response.errors && response.errors.length > 0
        ? response.errors[0].description
        : ProductErrors.ProductNotAvailable.description;
      Swal.fire({
        title: this.translate.instant('GENERAL.RESPONSE.ERROR_TITLE'),
        text: message,
        icon: "error",
      });
    });
  }

  increaseProduct(productId: string) {
    this.shoppingCartService.increaseCartItem(productId).then(response => {
      if (response.succeeded)
        return;
      const message = response.errors && response.errors.length > 0
        ? response.errors[0].description
        : ProductErrors.ProductNotAvailable.description;
      Swal.fire({
        title: this.translate.instant('GENERAL.RESPONSE.ERROR_TITLE'),
        text: message,
        icon: "error",
      });
    });
  }

  getTranslation(key: string, param: string = null): Observable<string> {
    return this.translate.get(key, { value: param });
  }

  navigateToUrl(url: string) {
    this.router.navigateByUrl(url);
  }

  getOrderTypeText(): string {
    return OrderTypeUtils.getOrderTypeText(this.shoppingCartService.getOrderType());
  }

  editOrderDetails() {
    const modalRef = this.modalService.open(EditOrderDetailsModalComponent, { centered: true, size: "lg" });
    modalRef.componentInstance.productCategoryUpdatedEmitter.subscribe(() => {
      //this.orderType = OrderTypeUtils.getOrderTypeText(this.shoppingCartService.getOrderType());
    });
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
