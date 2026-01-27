import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-today-reports-help-dialog',
    imports: [TranslateModule, MatIconModule],
    templateUrl: './today-reports-help-dialog.component.html',
    styleUrl: './today-reports-help-dialog.component.scss'
})
export class TodayReportsHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
