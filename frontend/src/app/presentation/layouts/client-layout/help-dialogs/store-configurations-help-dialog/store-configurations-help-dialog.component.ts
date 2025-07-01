import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-store-configurations-help-dialog',
  standalone: true,
  imports: [TranslateModule, MatIconModule],
  templateUrl: './store-configurations-help-dialog.component.html',
  styleUrl: './store-configurations-help-dialog.component.scss'
})
export class StoreConfigurationsHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
