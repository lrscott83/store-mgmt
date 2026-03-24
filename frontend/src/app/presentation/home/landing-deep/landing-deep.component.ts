import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  ViewChildren,
  QueryList,
  OnInit,
  ChangeDetectorRef
} from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-landing-deep',
  imports: [RouterModule],
  templateUrl: './landing-deep.component.html',
  styleUrl: './landing-deep.component.scss'
})
export class LandingDeepComponent implements AfterViewInit, OnInit {
  isScrolled = false;
  menuOpen = false;
  canInstall = false;

  @ViewChild('navEl') navEl!: ElementRef<HTMLElement>;
  @ViewChildren('featureCard') featureCards!: QueryList<ElementRef<HTMLElement>>;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.checkPWAInstallability();
  }

  get showLoginButton(): boolean {
    return !this.canInstall;
  }

  private checkPWAInstallability(): void {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    const swSupported = 'serviceWorker' in navigator;

    console.log('[LandingDeep] checkPWAInstallability:', { isStandalone, swSupported, hostname: window.location.hostname });

    if (swSupported && !isStandalone) {
      this.canInstall = true;
    } else {
      this.canInstall = false;
    }

    console.log('[LandingDeep] canInstall set to:', this.canInstall);
    this.cdr.detectChanges();

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      this.canInstall = true;
      console.log('[LandingDeep] beforeinstallprompt received');
      this.cdr.detectChanges();
    });

    window.addEventListener('appinstalled', () => {
      this.canInstall = false;
      this.cdr.detectChanges();
    });
  }

  closeMenu(): void {
    setTimeout(() => {
      this.menuOpen = false;
    }, 10);
  }

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
