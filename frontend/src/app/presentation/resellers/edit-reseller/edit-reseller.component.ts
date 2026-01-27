import { Component } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { MatTabsModule } from '@angular/material/tabs';
import { EditResellerDetailsComponent } from '../edit-reseller-details/edit-reseller-details.component';

@Component({
    selector: 'app-edit-reseller',
    imports: [SharedModule, TranslateModule, MatTabsModule, EditResellerDetailsComponent],
    templateUrl: './edit-reseller.component.html',
    styleUrl: './edit-reseller.component.scss'
})
export class EditResellerComponent {
  navigateToCreateReSeller() {

  }
}
