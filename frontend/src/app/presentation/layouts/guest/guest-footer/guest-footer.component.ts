import { Component } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-guest-footer',
  standalone: true,
  imports: [TranslateModule, RouterModule, MatIcon],
  templateUrl: './guest-footer.component.html',
  styleUrl: './guest-footer.component.scss'
})
export class GuestFooterComponent {
  showEmailDialog() {
  
  }

  getYear(): number {
    return new Date().getFullYear();
  }
}


