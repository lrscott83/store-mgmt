import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-profile-help-dialog',
    imports: [TranslateModule, MatIconModule],
    templateUrl: './profile-help-dialog.component.html',
    styleUrl: './profile-help-dialog.component.scss'
})
export class ProfileHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
