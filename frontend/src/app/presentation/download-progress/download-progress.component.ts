import { Component, Input } from '@angular/core';
import { SharedModule } from '../shared/shared.module';

@Component({
  selector: 'app-download-progress',
  standalone: false,
  templateUrl: './download-progress.component.html',
  styleUrl: './download-progress.component.scss'
})
export class DownloadProgressComponent {
  @Input() show = false;
  @Input() progress = 0;
  @Input() title = 'Descargando aplicación';
  @Input() message = 'Por favor espera mientras se descarga la aplicación...';
  @Input() downloadedSize = 0;
  @Input() totalSize = 0;
  @Input() estimatedTime = '';
}
