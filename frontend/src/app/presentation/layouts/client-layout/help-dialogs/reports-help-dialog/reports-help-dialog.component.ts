import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-reports-help-dialog',
    imports: [TranslateModule, MatIconModule],
    templateUrl: './reports-help-dialog.component.html',
    styleUrl: './reports-help-dialog.component.scss'
})
export class ReportsHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
