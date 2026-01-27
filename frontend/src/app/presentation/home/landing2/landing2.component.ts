import { Component } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';

@Component({
    selector: 'app-landing2',
    imports: [SharedModule],
    templateUrl: './landing2.component.html',
    styleUrl: './landing2.component.scss'
})
export class Landing2Component {
  screenshots = [
    { title: 'Panel principal', image: 'assets/screenshots/captura1.png' },
    { title: 'Registro de ventas', image: 'assets/screenshots/captura2.png' },
    { title: 'Consulta de inventario', image: 'assets/screenshots/captura3.png' }
  ];
}
