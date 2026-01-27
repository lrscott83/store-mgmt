import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-receive-help-dialog',
    imports: [TranslateModule, MatIconModule],
    templateUrl: './receive-help-dialog.component.html',
    styleUrl: './receive-help-dialog.component.scss'
})
export class ReceiveHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
