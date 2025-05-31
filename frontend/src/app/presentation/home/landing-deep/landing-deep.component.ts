import { AfterViewInit, Component } from '@angular/core';
import { RouterModule } from '@angular/router';

declare const bootstrap: any;

@Component({
  selector: 'app-landing-deep',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './landing-deep.component.html',
  styleUrl: './landing-deep.component.scss'
})
export class LandingDeepComponent implements AfterViewInit{
  ngAfterViewInit(): void {
    const navLinks = document.querySelectorAll('.navbar-collapse .nav-link');
    const navbarCollapse = document.querySelector('.navbar-collapse');

    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (navbarCollapse && navbarCollapse.classList.contains('show')) {
          new bootstrap.Collapse(navbarCollapse).toggle();
        }
      });
    });
  }
}
