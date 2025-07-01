import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-today-inventory-stats-help-dialog',
  standalone: true,
  imports: [TranslateModule, MatIconModule],
  templateUrl: './today-inventory-stats-help-dialog.component.html',
  styleUrl: './today-inventory-stats-help-dialog.component.scss'
})
export class TodayInventoryStatsHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
