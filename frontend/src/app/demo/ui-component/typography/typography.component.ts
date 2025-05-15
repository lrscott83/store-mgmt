// angular import
import { Component } from '@angular/core';
import { SharedModule } from 'src/app/presentation/shared/shared.module';

// project import

@Component({
  selector: 'app-typography',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './typography.component.html',
  styleUrls: ['./typography.component.scss']
})
export default class TypographyComponent {}
