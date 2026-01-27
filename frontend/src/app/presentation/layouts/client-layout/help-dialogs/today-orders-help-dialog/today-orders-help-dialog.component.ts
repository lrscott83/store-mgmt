import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-today-orders-help-dialog',
    imports: [TranslateModule, MatIconModule],
    templateUrl: './today-orders-help-dialog.component.html',
    styleUrl: './today-orders-help-dialog.component.scss'
})
export class TodayOrdersHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
