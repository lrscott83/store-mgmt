import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-owners-help-dialog',
    imports: [TranslateModule, MatIconModule],
    templateUrl: './owners-help-dialog.component.html',
    styleUrl: './owners-help-dialog.component.scss'
})
export class OwnersHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
