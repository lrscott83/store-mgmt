import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-orders-help-dialog',
    imports: [TranslateModule, MatIconModule],
    templateUrl: './orders-help-dialog.component.html',
    styleUrl: './orders-help-dialog.component.scss'
})
export class OrdersHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
