import { Component } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-client-footer',
  standalone: true,
  imports: [RouterModule, TranslateModule, MatIcon],
  templateUrl: './client-footer.component.html',
  styleUrl: './client-footer.component.scss'
})
export class ClientFooterComponent {
  showEmailDialog() {

  }

  getYear(): number {
    return new Date().getFullYear();
  }
}
