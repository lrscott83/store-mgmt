// angular import
import { Component, effect, OnInit, signal } from '@angular/core';
import { TranslationService } from './_modules/i18n/translation.service';

// language list
import { locale as enLang } from './_modules/i18n/vocabs/en';
import { locale as chLang } from './_modules/i18n/vocabs/ch';
import { locale as esLang } from './_modules/i18n/vocabs/es';
import { locale as jpLang } from './_modules/i18n/vocabs/jp';
import { locale as deLang } from './_modules/i18n/vocabs/de';
import { locale as frLang } from './_modules/i18n/vocabs/fr';
import { LoadingComponent } from './presentation/shared/components/loading/loading.component';
//import { UpdateService } from './_services/update/update.service';
import { StoreUsageTrackerService } from './_services/usage-tracker/store-usage-tracker.service';
import Swal from 'sweetalert2';
import { SwUpdate } from '@angular/service-worker';
import { DownloadManagerService } from './_services/download-manager/download-manager.service';
import { filter } from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: false
})
export class AppComponent implements OnInit {
  // public props
  title = 'vende-de-todo';
  public spinnerComponent = LoadingComponent;

  showInstallPrompt = false;
  deferredPrompt: any = null;
  canInstall = false;

  isDownloading$ = this.downloadManager.isDownloading$;
  progress$ = this.downloadManager.progress$;
  downloadedSize$ = this.downloadManager.downloadedSize$;
  totalSize$ = this.downloadManager.totalSize$;
  estimatedTime = '';

  constructor(
    private translationService: TranslationService,
    // private updateService: UpdateService,
    private storeUsageTracker: StoreUsageTrackerService,
    private downloadManager: DownloadManagerService
    //private swUpdate: SwUpdate
    //private tableService: TableExtendedService
  ) {
    // register translations
    this.translationService.loadTranslations(esLang, enLang, chLang, jpLang, deLang, frLang);
  }

  ngOnInit() {
    this.storeUsageTracker.cleanOldData(30);
    this.checkIfInstalled();
    this.listenToBeforeInstallPrompt();
    this.checkFirstVisit();
    this.setupProgressTracking();
    this.checkPWAStatus();
  }

  pwaStatus = '';

  private checkPWAStatus(): void {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    const swSupported = 'serviceWorker' in navigator;

    this.pwaStatus = `Mode: ${isStandalone ? 'standalone' : 'browser'} | SW: ${swSupported ? 'supported' : 'not supported'}`;

    console.log('[PWA] === PWA Status Check ===');
    console.log('[PWA] Display mode:', isStandalone ? 'standalone' : 'browser');
    console.log('[PWA] Navigator.standalone:', (window.navigator as any).standalone);
    console.log('[PWA] Service Worker supported:', swSupported);

    if (swSupported) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        console.log('[PWA] Service Worker registrations:', registrations.length);
        registrations.forEach((reg) => {
          console.log('[PWA] SW Scope:', reg.scope);
          console.log('[PWA] SW State:', reg.active ? 'active' : 'inactive');
        });
      });
    }
  }

  private checkFirstVisit(): void {
    const hasVisited = localStorage.getItem('app_has_visited');

    if (!hasVisited && this.isPWAInstalled()) {
      this.downloadManager.startDownload();

      // Simular progreso para primera descarga
      this.simulateDownloadProgress();

      localStorage.setItem('app_has_visited', 'true');
    }
  }

  private isPWAInstalled(): boolean {
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

    const elapsedSeconds = (progress / 100) * 10; // Simulación
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

  private checkIfInstalled(): void {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

    // Si NO está en modo standalone, puede ser candidata a instalación
    if (!isStandalone) {
      // Pero aún no mostramos el mensaje: esperamos a ver si el navegador permite instalarla
    }
  }

  private listenToBeforeInstallPrompt(): void {
    console.log('[PWA] Listening for beforeinstallprompt');

    if (!('BeforeInstallPromptEvent' in window)) {
      console.log('[PWA] beforeinstallprompt NOT supported in this browser');
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('[PWA] beforeinstallprompt fired', e);
      e.preventDefault();
      this.deferredPrompt = e;
      this.canInstall = true;

      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

      console.log('[PWA] isStandalone:', isStandalone);

      if (!isStandalone) {
        this.showInstallPrompt = true;
        Swal.fire({
          title: '¡Instalación disponible!',
          text: 'Deseas instalar esta app en tu dispositivo?',
          icon: 'question',
          showConfirmButton: true,
          showCancelButton: true,
          allowOutsideClick: false,
          allowEscapeKey: false,
          confirmButtonText: 'Si',
          cancelButtonText: 'No',
          customClass: {
            confirmButton: 'swal2-confirm swal2-styled'
          }
        }).then((result) => {
          if (result.isConfirmed) {
            this.installPwa();
          }
        });
      }
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall = false;
      console.log('[PWA] Application installed');
    });
  }

  installPwa(): void {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('Usuario instaló la PWA');
        }
        this.showInstallPrompt = false;
        this.deferredPrompt = null;
      });
    }
  }
}
