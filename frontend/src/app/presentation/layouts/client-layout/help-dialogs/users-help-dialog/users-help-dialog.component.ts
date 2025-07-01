import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-users-help-dialog',
  standalone: true,
  imports: [TranslateModule, MatIconModule],
  templateUrl: './users-help-dialog.component.html',
  styleUrl: './users-help-dialog.component.scss'
})
export class UsersHelpDialogComponent {
  constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
