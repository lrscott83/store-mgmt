import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-today-sales-stats-help-dialog',
    imports: [TranslateModule, MatIconModule],
    templateUrl: './today-sales-stats-help-dialog.component.html',
    styleUrl: './today-sales-stats-help-dialog.component.scss'
})
export class TodaySalesStatsHelpDialogComponent {
  constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
