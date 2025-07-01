import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-download-help-dialog',
  standalone: true,
  imports: [TranslateModule, MatIconModule],
  templateUrl: './download-help-dialog.component.html',
  styleUrl: './download-help-dialog.component.scss'
})
export class DownloadHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
