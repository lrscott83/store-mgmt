import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-inventory-help-dialog',
  standalone: true,
  imports: [TranslateModule, MatIconModule],
  templateUrl: './inventory-help-dialog.component.html',
  styleUrl: './inventory-help-dialog.component.scss'
})
export class InventoryHelpDialogComponent {
constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
