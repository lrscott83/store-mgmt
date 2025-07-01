import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-send-help-dialog',
  standalone: true,
  imports: [TranslateModule, MatIconModule],
  templateUrl: './send-help-dialog.component.html',
  styleUrl: './send-help-dialog.component.scss'
})
export class SendHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
