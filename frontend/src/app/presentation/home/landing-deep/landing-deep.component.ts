import { AfterViewInit, Component, ElementRef, HostListener, ViewChild, ViewChildren, QueryList } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-landing-deep',
  imports: [RouterModule],
  templateUrl: './landing-deep.component.html',
  styleUrl: './landing-deep.component.scss'
})
export class LandingDeepComponent implements AfterViewInit {
  isScrolled = false;
  menuOpen = false;

  @ViewChild('navEl') navEl!: ElementRef<HTMLElement>;
  @ViewChildren('featureCard') featureCards!: QueryList<ElementRef<HTMLElement>>;

  ngAfterViewInit(): void {
    this.setupScrollObserver();
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.isScrolled = window.scrollY > 40;
  }

  private setupScrollObserver(): void {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );

    this.featureCards.forEach((card) => {
      observer.observe(card.nativeElement);
    });
  }
}
