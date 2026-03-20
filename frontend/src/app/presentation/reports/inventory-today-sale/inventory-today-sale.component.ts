import { Component } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TranslationModule } from 'src/app/_modules/i18n/translation.module';
import { TranslateService } from '@ngx-translate/core';
import { ProductRepository } from 'src/app/application/products/product.repository';
import { Product } from 'src/app/domain/entities/products/product.model';
import { OrderOfflineService } from 'src/app/application/orders/order-offline.service';
import { InventoryOfflineService } from 'src/app/application/entries/inventory-offline.service';
import { Order } from 'src/app/domain/entities/orders/order.model';
import { InventoryEntry } from 'src/app/domain/entities/entries/inventory-entry.model';
import { BaseResponseModel } from 'src/app/_services/_models/base.model';
import { InventoryEntryView } from 'src/app/domain/entities/entries/inventory-entry-view.model';
import { OrderItem } from 'src/app/domain/entities/orders/order-item.model';
import { InventoryCategoryView } from 'src/app/application/entries/inventory-category.view';
import { InventoryProductView } from 'src/app/application/entries/inventory-product-view';

// import jsPDF from 'jspdf';
// import 'jspdf-autotable';

@Component({
  selector: 'app-inventory-today-sale',
  imports: [TranslationModule, SharedModule],
  templateUrl: './inventory-today-sale.component.html',
  styleUrl: './inventory-today-sale.component.scss'
})
export class InventoryTodaySaleComponent {
  generateReport() {
    console.log('[InventoryTodaySale] generateReport disabled - jspdf lazy loaded');
    // jspdf lazy loaded - PDF generation disabled
  }

  generateReportWithBorder() {
    console.log('[InventoryTodaySale] generateReportWithBorder disabled - jspdf lazy loaded');
    // jspdf lazy loaded - PDF generation disabled
  }

  constructor(
    private translate: TranslateService,
    private productService: ProductRepository,
    private orderService: OrderOfflineService,
    private inventoryService: InventoryOfflineService
  ) {}

  // generateReport() {
  //   const doc = new jsPDF({
  //     orientation: 'landscape',
  //     unit: 'pt',
  //     format: 'letter'
  //   });

  //   const encabezado = [
  //     'Empresa: _____________________       Procedencia: _____________________',
  //     'Unidad: _____________________         UBA: _____  OEE: _____  D__/__/__',
  //     'Departamento: ________________        Balance: _____  BAT: _____',
  //     'Firma del Administrador: _____________________________________________'
  //   ];

  //   encabezado.forEach((linea, i) => {
  //     doc.setFontSize(10);
  //     doc.setFont('helvetica', 'bold');
  //     doc.text(linea, 40, 30 + i * 14);
  //   });

  //   doc.setFontSize(12);
  //   doc.setFont('helvetica', 'bold');
  //   doc.text('INVENTARIO A PRECIO DE VENTA', 300, 100);

  //   const headers = [[
  //     'Producto', 'U.M', 'Inicio', 'Entrada', 'Disponible', 'Vendido',
  //     'Precio Venta', 'Importe Venta', 'Costo Unitario', 'Costo Total',
  //     'C.P Venta', 'Final', 'Importe Final'
  //   ]];

  //   const rows = this.generateProductRows();

  //   (doc as any).autoTable({
  //     head: headers,
  //     body: rows,
  //     styles: { fontSize: 8, cellPadding: 3 },
  //     headStyles: { fillColor: [220, 220, 220], textColor: 0 },
  //     margin: { top: 120, left: 40, right: 40 },
  //     didDrawPage: (data) => {
  //       if (data.pageNumber > 1) {
  //         encabezado.forEach((linea, i) => {
  //           doc.setFontSize(10);
  //           doc.setFont('helvetica', 'bold');
  //           doc.text(linea, 40, 30 + i * 14);
  //         });
  //         doc.setFontSize(12);
  //         doc.setFont('helvetica', 'bold');
  //         doc.text('INVENTARIO A PRECIO DE VENTA', 300, 100);
  //       }
  //     }
  //   });

  //   const pdfBlob = doc.output('blob');
  //   const pdfUrl = URL.createObjectURL(pdfBlob);
  //   window.open(pdfUrl);
  // }

  // generateReportWithBorder() {
  //   const doc = new jsPDF({
  //     orientation: 'landscape',
  //     unit: 'pt',
  //     format: 'letter'
  //   });

  //   const pageWidth = doc.internal.pageSize.getWidth();
  //   const pageHeight = doc.internal.pageSize.getHeight();

  //   const drawPageFrame = () => {
  //     doc.setLineWidth(3);
  //     doc.rect(10, 10, pageWidth - 20, pageHeight - 20);

  //     const encabezado = [
  //       'Empresa: _____________________       Procedencia: _____________________',
  //       'Unidad: _____________________         UBA: _____  OEE: _____  D__/__/__',
  //       'Departamento: ________________        Balance: _____  BAT: _____',
  //       'Firma del Administrador: _____________________________________________'
  //     ];

  //     encabezado.forEach((linea, i) => {
  //       doc.setFontSize(10);
  //       doc.text(linea, 40, 30 + i * 14);
  //     });

  //     doc.setFontSize(12);
  //     doc.setFont('helvetica', 'bold');
  //     doc.text('INVENTARIO A PRECIO DE VENTA', 300, 100);
  //   };

  //   drawPageFrame();

  //   const productos = [
  //     { nombre: 'Producto A', um: 'Und', inicio: 10, entrada: 5, vendido: 3, precio: 50, costo: 30 },
  //     { nombre: 'Producto B', um: 'Caja', inicio: 20, entrada: 0, vendido: 10, precio: 40, costo: 25 },
  //     { nombre: 'Producto C', um: 'Lata', inicio: 30, entrada: 10, vendido: 5, precio: 20, costo: 15 },
  //   ];

  //   const headers = [[
  //     'Producto', 'U.M', 'Inicio', 'Entrada', 'Disponible', 'Vendido',
  //     'Precio Venta', 'Importe Venta', 'Costo Unitario', 'Costo Total',
  //     'C.P Venta', 'Final', 'Importe Final'
  //   ]];

  //   const rows = productos.map(p => {
  //     const disponible = p.inicio + p.entrada;
  //     const importeVenta = p.precio * p.vendido;
  //     const costoTotal = p.costo * p.vendido;
  //     const cpVenta = p.precio - p.costo;
  //     const final = disponible - p.vendido;
  //     const importeFinal = final * p.precio;

  //     return [
  //       p.nombre, p.um, p.inicio, p.entrada, disponible, p.vendido,
  //       p.precio.toFixed(2), importeVenta.toFixed(2), p.costo.toFixed(2),
  //       cpVenta.toFixed(2), final, importeFinal.toFixed(2)
  //     ];
  //   });

  //   (doc as any).autoTable({
  //     startY: 120,
  //     head: headers,
  //     body: rows,
  //     styles: { fontSize: 8, cellPadding: 3 },
  //     headStyles: { fillColor: [220, 220, 220], textColor: 0 },
  //     margin: { left: 40, right: 40 },
  //     didDrawPage: () => drawPageFrame()
  //   });

  //   const pdfBlob = doc.output('blob');
  //   const pdfUrl = URL.createObjectURL(pdfBlob);
  //   window.open(pdfUrl);
  // }

  generateProductRows(): any[] {
    const today: Date = new Date();
    const products: Product[] = this.productService.getAvailableProducts();
    const todayOrders: Order[] = this.orderService.getActiveOrdersInDay(today);
    const todayEntries: BaseResponseModel<InventoryEntryView[]> = this.inventoryService.getInventoryEntriesInDay(today);
    const inventoryCategories: BaseResponseModel<InventoryCategoryView[]> = this.inventoryService.getInventoryCategoriesView();
    const inventoryProducts: InventoryProductView[] = inventoryCategories.succeeded
      ? inventoryCategories.data.flatMap((c) => c.products)
      : [];

    return products.map((prod) => {
      const orderItems: OrderItem[] = todayOrders.flatMap((o) => o.orderItems).filter((oi) => oi.productId === prod.id);
      const productTodayEntries = todayEntries.succeeded ? todayEntries.data.filter((e) => e.productId === prod.id) : [];
      const productAvailableEntries: InventoryEntry[] =
        this.inventoryService.getProductInventoriesByProductId(prod.id)?.filter((e) => e.available && e.available > 0) ?? [];
      const availableProduct: InventoryProductView = inventoryProducts.find((p) => p.productId === prod.id);
      const available: number = availableProduct?.quantity ?? 0;
      const entryQuantity: number = productTodayEntries.reduce((total, e) => total + e.quantity, 0);
      const vendido: number = orderItems.reduce((total, oi) => total + oi.quantity, 0);
      const disponible: number = available + vendido;
      const inicio = available + vendido - entryQuantity;
      const precioVenta = orderItems.length > 0 ? orderItems.reduce((total, oi) => total + oi.price, 0) / orderItems.length : 0;
      const importeVenta = vendido * precioVenta;
      let costoUnitario: number = 0;
      if (productAvailableEntries.length > 0) {
        costoUnitario =
          productAvailableEntries.reduce((total, e) => total + e.costPrice * e.quantity, 0) /
          productAvailableEntries.reduce((total, e) => total + e.quantity, 0);
      }
      const costoTotal = vendido * costoUnitario;
      const cpVenta = importeVenta > 0 ? costoTotal / importeVenta : 0;
      const final = disponible - vendido;
      const importeFinal = final * costoUnitario;

      return [
        prod.name,
        'U',
        inicio,
        entryQuantity,
        disponible,
        vendido,
        precioVenta.toFixed(2),
        importeVenta.toFixed(2),
        costoUnitario.toFixed(2),
        costoTotal.toFixed(2),
        cpVenta.toFixed(2),
        final,
        importeFinal.toFixed(2)
      ];
    });
  }
}
