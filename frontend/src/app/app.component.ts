import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { TranslationService } from './_modules/i18n/translation.service';
import { locale as enLang } from './_modules/i18n/vocabs/en';
import { locale as chLang } from './_modules/i18n/vocabs/ch';
import { locale as esLang } from './_modules/i18n/vocabs/es';
import { locale as jpLang } from './_modules/i18n/vocabs/jp';
import { locale as deLang } from './_modules/i18n/vocabs/de';
import { locale as frLang } from './_modules/i18n/vocabs/fr';
import { LoadingComponent } from './presentation/shared/components/loading/loading.component';
import { UpdateService } from './_services/update/update.service';
import { LoadingService } from './_services/loading.service';
import { StoreUsageTrackerService } from './_services/usage-tracker/store-usage-tracker.service';
import { DownloadManagerService } from './_services/download-manager/download-manager.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: false
})
export class AppComponent implements OnInit {
  title = 'vende-de-todo';
  public spinnerComponent = LoadingComponent;

  deferredPrompt: any = null;
  canInstall = false;

  isDownloading$ = this.downloadManager.isDownloading$;
  progress$ = this.downloadManager.progress$;
  downloadedSize$ = this.downloadManager.downloadedSize$;
  totalSize$ = this.downloadManager.totalSize$;
  estimatedTime = '';
  loading$ = this.loadingService.loading$;

  constructor(
    private translationService: TranslationService,
    private updateService: UpdateService,
    private storeUsageTracker: StoreUsageTrackerService,
    private downloadManager: DownloadManagerService,
    private loadingService: LoadingService,
    private cdr: ChangeDetectorRef
  ) {
    console.log('[AppComponent] Constructor - START');
    console.log('[AppComponent] Loading translations...');
    this.translationService.loadTranslations(esLang, enLang, chLang, jpLang, deLang, frLang);
    console.log('[AppComponent] Constructor - DONE');
  }

  ngOnInit() {
    console.log('[AppComponent] ngOnInit - START');
    console.log('[AppComponent] URL on init:', window.location.href);

    this.storeUsageTracker.cleanOldData(30);
    this.checkPWAInstallability();
    this.checkFirstVisit();
    this.setupProgressTracking();
    setTimeout(() => this.updateService.init(), 5000);
    console.log('[AppComponent] ngOnInit - DONE');
  }

  private checkPWAInstallability(): void {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    const swSupported = 'serviceWorker' in navigator;

    // Check if we're in development mode (localhost or 127.0.0.1)
    const isDevMode = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    console.log('[AppComponent] checkPWAInstallability:', { isStandalone, swSupported, isDevMode, hostname: window.location.hostname });

    if (swSupported && !isStandalone) {
      this.canInstall = true;
    } else {
      this.canInstall = false;
      this.deferredPrompt = null;
    }

    console.log('[AppComponent] canInstall set to:', this.canInstall);
    this.cdr.detectChanges();

    // In dev mode, simulate deferredPrompt availability
    if (isDevMode && this.canInstall) {
      console.log('[AppComponent] Dev mode detected - PWA install available');
    }

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.canInstall = true;
      console.log('[AppComponent] beforeinstallprompt received');
      this.cdr.detectChanges();
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall = false;
      this.cdr.detectChanges();
    });
  }

  private checkFirstVisit(): void {
    const hasVisited = localStorage.getItem('app_has_visited');

    if (!hasVisited && this.isStandaloneMode()) {
      this.downloadManager.startDownload();
      this.simulateDownloadProgress();
      localStorage.setItem('app_has_visited', 'true');
    }
  }

  private isStandaloneMode(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
  }

  private simulateDownloadProgress(): void {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 10;

      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => this.downloadManager.completeDownload(), 500);
      }

      this.downloadManager.updateProgress(progress);
      this.calculateEstimatedTime(progress);
    }, 300);
  }

  private calculateEstimatedTime(progress: number): void {
    if (progress === 0) {
      this.estimatedTime = 'Calculando...';
      return;
    }

    const elapsedSeconds = (progress / 100) * 10;
    const remainingSeconds = (100 - progress) * (elapsedSeconds / progress);

    if (remainingSeconds < 60) {
      this.estimatedTime = `${Math.ceil(remainingSeconds)} seg`;
    } else {
      this.estimatedTime = `${Math.ceil(remainingSeconds / 60)} min`;
    }
  }

  private setupProgressTracking(): void {
    this.progress$.subscribe((progress) => {
      this.calculateEstimatedTime(progress);
    });
  }

  installPwa(): void {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('[PWA] User installed the app');
        }
        this.deferredPrompt = null;
      });
    }
  }
}
