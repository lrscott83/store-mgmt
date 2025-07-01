import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { IconService } from '@ant-design/icons-angular';
import { QuestionOutline } from '@ant-design/icons-angular/icons';
import { NgbActiveModal, NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';
import { ProductsHelpDialogComponent } from '../products-help-dialog/products-help-dialog.component';
import { SaleHelpDialogComponent } from '../sale-help-dialog/sale-help-dialog.component';
import { TodayOrdersHelpDialogComponent } from '../today-orders-help-dialog/today-orders-help-dialog.component';
import { TodaySalesStatsHelpDialogComponent } from '../today-sales-stats-help-dialog/today-sales-stats-help-dialog.component';

@Component({
  selector: 'app-sales-help-dialog',
  standalone: true,
  imports: [TranslateModule, MatIconModule, CommonModule],
  templateUrl: './sales-help-dialog.component.html',
  styleUrl: './sales-help-dialog.component.scss'
})
export class SalesHelpDialogComponent {
  constructor(private modal: NgbActiveModal, private modalService: NgbModal) {
  }

  closeModal() {
    this.modal.close();
  }

  openCatalogHelpDialog() {
      this.modalService.open(ProductsHelpDialogComponent, { centered: true, size: "lg" });
  }

  openSaleHelpDialog() {
    this.modalService.open(SaleHelpDialogComponent, { centered: true, size: "lg" });
  }

  opentTodayOrdersHelpDialog() {
    this.modalService.open(TodayOrdersHelpDialogComponent, { centered: true, size: "lg" });
  }

  opentTodaySalesStatsHelpDialog() {
    this.modalService.open(TodaySalesStatsHelpDialogComponent, { centered: true, size: "lg" });
  }
}
