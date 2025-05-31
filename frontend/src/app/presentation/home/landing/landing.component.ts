import { Component } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [SharedModule],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent {
  screenshots = [
    { title: 'Panel principal', image: 'assets/screenshots/captura1.png' },
    { title: 'Registro de ventas', image: 'assets/screenshots/captura2.png' },
    { title: 'Consulta de inventario', image: 'assets/screenshots/captura3.png' },
  ];
}
