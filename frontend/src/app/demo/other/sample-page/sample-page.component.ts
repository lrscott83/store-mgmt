// angular import
import { Component } from '@angular/core';
import { SharedModule } from 'src/app/presentation/shared/shared.module';

// project import

@Component({
  selector: 'app-sample-page',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './sample-page.component.html',
  styleUrls: ['./sample-page.component.scss']
})
export default class SamplePageComponent {}
