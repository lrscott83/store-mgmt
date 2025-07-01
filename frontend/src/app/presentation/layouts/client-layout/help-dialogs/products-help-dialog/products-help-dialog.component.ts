import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-products-help-dialog',
  standalone: true,
  imports: [TranslateModule, MatIconModule],
  templateUrl: './products-help-dialog.component.html',
  styleUrl: './products-help-dialog.component.scss'
})
export class ProductsHelpDialogComponent {

  constructor(private modal: NgbActiveModal) {

  }

  closeModal() {
    this.modal.close();
  }
}
