import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-features-help-dialog',
    imports: [TranslateModule, MatIconModule],
    templateUrl: './features-help-dialog.component.html',
    styleUrl: './features-help-dialog.component.scss'
})
export class FeaturesHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
