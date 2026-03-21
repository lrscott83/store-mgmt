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
import { UpdateService } from './_services/update/update.service';
import { LoadingService } from './_services/loading.service';
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
  loading$ = this.loadingService.loading$;

  constructor(
    private translationService: TranslationService,
    private updateService: UpdateService,
    private storeUsageTracker: StoreUsageTrackerService,
    private downloadManager: DownloadManagerService,
    private loadingService: LoadingService
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
    setTimeout(() => this.updateService.init(), 5000);
  }

  pwaStatus = '';

  private checkPWAStatus(): void {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    const swSupported = 'serviceWorker' in navigator;

    this.pwaStatus = `Mode: ${isStandalone ? 'standalone' : 'browser'} | SW: ${swSupported ? 'OK' : 'no'}`;

    if (swSupported && !isStandalone) {
      this.canInstall = true;
    }

    console.log('[PWA] === PWA Status Check ===');
    console.log('[PWA] Display mode:', isStandalone ? 'standalone' : 'browser');
    console.log('[PWA] Service Worker supported:', swSupported);
    console.log('[PWA] Can install:', this.canInstall);

    if (swSupported) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          console.log('[PWA] Service Worker registrations:', registrations.length);
          if (registrations.length > 0) {
            registrations.forEach((reg) => {
              console.log('[PWA] SW Scope:', reg.scope);
              console.log('[PWA] SW State:', reg.active ? 'active' : reg.installing ? 'installing' : reg.waiting ? 'waiting' : 'unknown');
            });
          }
        })
        .catch((err) => {
          console.error('[PWA] Error getting registrations:', err);
        });

      navigator.serviceWorker.ready
        .then((registration) => {
          console.log('[PWA] Service Worker ready:', registration);
        })
        .catch((err) => {
          console.error('[PWA] Service Worker ready error:', err);
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

    const beforeInstallHandler = (e: Event) => {
      console.log('[PWA] beforeinstallprompt fired', e);
      e.preventDefault();
      this.deferredPrompt = e;
      this.canInstall = true;
    };

    window.addEventListener('beforeinstallprompt', beforeInstallHandler);

    setTimeout(() => {
      window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
      console.log('[PWA] Removed beforeinstallprompt listener');
    }, 60000);

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall = false;
      console.log('[PWA] Application installed');
      Swal.fire({
        title: '¡PWA instalada!',
        text: 'La aplicación se ha instalado correctamente.',
        icon: 'success',
        confirmButtonText: 'OK'
      });
    });
  }

  installPwa(): void {
    console.log('[PWA] installPwa called, deferredPrompt:', this.deferredPrompt);

    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('[PWA] Usuario instaló la PWA');
        }
        this.showInstallPrompt = false;
        this.deferredPrompt = null;
      });
    } else {
      this.showManualInstallInstructions();
    }
  }

  private showManualInstallInstructions(): void {
    const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);

    let instructions = `
      <div style="text-align: left; padding: 10px;">
        <p><strong>Para instalar la PWA:</strong></p>
        <ol>
          <li>Haz clic en los <strong>3 puntos</strong> (arriba derecha del navegador)</li>
          <li>Busca la opción <strong>"Instalar Vende De Todo"</strong></li>
        </ol>
        <hr/>
        <p><strong>O prueba:</strong></p>
        <ul>
          <li>Arrastra la pestaña a tu escritorio</li>
          <li>Busca el icono de install en la barra de direcciones</li>
        </ul>
      </div>
    `;

    Swal.fire({
      title: 'Cómo instalar la PWA',
      html: instructions,
      icon: 'info',
      confirmButtonText: 'Entendido'
    });
  }
}
