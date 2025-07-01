import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-dashboard-help-dialog',
  standalone: true,
  imports: [TranslateModule, MatIconModule],
  templateUrl: './dashboard-help-dialog.component.html',
  styleUrl: './dashboard-help-dialog.component.scss'
})
export class DashboardHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
