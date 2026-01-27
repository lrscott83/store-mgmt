import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
    selector: 'app-statistics-help-dialog',
    imports: [TranslateModule, MatIconModule],
    templateUrl: './statistics-help-dialog.component.html',
    styleUrl: './statistics-help-dialog.component.scss'
})
export class StatisticsHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
