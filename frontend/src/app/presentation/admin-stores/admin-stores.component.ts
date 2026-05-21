import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-admin-stores',
  imports: [CommonModule, TranslateModule],
  templateUrl: './admin-stores.component.html',
  styleUrl: './admin-stores.component.scss'
})
export class AdminStoresComponent {}
