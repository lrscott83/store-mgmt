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
import { StoreUsageTrackerService } from './_services/usage-tracker/store-usage-tracker.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  // public props
  title = 'vende-de-todo';
  public spinnerComponent = LoadingComponent;

  showInstallPrompt = false;
  deferredPrompt: any = null;

  constructor(
    private translationService: TranslationService,
    private updateService: UpdateService,
    private storeUsageTracker: StoreUsageTrackerService
    //private tableService: TableExtendedService
  ) {
    // register translations
    this.translationService.loadTranslations(
      esLang,
      enLang,
      chLang,
      jpLang,
      deLang,
      frLang
    );
  }

  ngOnInit() {
    this.storeUsageTracker.cleanOldData(30); // Mantiene los últimos 30 días
    this.checkIfInstalled();
    this.listenToBeforeInstallPrompt();
  }

  private checkIfInstalled(): void {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;

    // Si NO está en modo standalone, puede ser candidata a instalación
    if (!isStandalone) {
      // Pero aún no mostramos el mensaje: esperamos a ver si el navegador permite instalarla
    }
  }

  private listenToBeforeInstallPrompt(): void {
    window.addEventListener('beforeinstallprompt', (e) => {
      // El navegador permite instalar la PWA
      e.preventDefault();
      this.deferredPrompt = e;

      // Verificamos que NO esté ya instalada
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as any).standalone === true;

      if (!isStandalone) {
        this.showInstallPrompt = true; // Mostrar banner/mensaje
        Swal.fire({
          title: '¡Instalción disponible!',
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
        }).then(result => {
          if (result.isConfirmed) {
            this.installPwa();
          }
        });
      }
    });

    window.addEventListener('appinstalled', () => {
      // La PWA fue instalada. Puedes ocultar el botón o enviar analytics.
      this.deferredPrompt = null;
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
