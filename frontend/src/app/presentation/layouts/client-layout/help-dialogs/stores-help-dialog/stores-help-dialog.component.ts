import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-stores-help-dialog',
    imports: [TranslateModule, MatIconModule],
    templateUrl: './stores-help-dialog.component.html',
    styleUrl: './stores-help-dialog.component.scss'
})
export class StoresHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
