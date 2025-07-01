import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-resellers-help-dialog',
  standalone: true,
  imports: [TranslateModule, MatIconModule],
  templateUrl: './resellers-help-dialog.component.html',
  styleUrl: './resellers-help-dialog.component.scss'
})
export class ResellersHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
