import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-synchronization-help-dialog',
    imports: [TranslateModule, MatIconModule],
    templateUrl: './synchronization-help-dialog.component.html',
    styleUrl: './synchronization-help-dialog.component.scss'
})
export class SynchronizationHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
