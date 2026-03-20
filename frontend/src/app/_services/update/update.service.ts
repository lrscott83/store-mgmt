import { Injectable, NgZone } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { interval, Subscription } from 'rxjs';
import Swal from 'sweetalert2';

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private versionSubscription: Subscription | null = null;
  private checkSubscription: Subscription | null = null;
  private readonly CHECK_INTERVAL_MS = 15 * 60 * 1000;

  constructor(
    private updates: SwUpdate,
    private zone: NgZone
  ) {}

  init(): void {
    if (!this.updates.isEnabled) return;

    this.zone.runOutsideAngular(() => {
      this.updates.versionUpdates.subscribe({
        next: (event) => {
          if (event.type === 'VERSION_READY') {
            this.zone.run(() => this.showUpdateDialog());
          }
        },
        error: () => {}
      });

      this.checkSubscription = interval(this.CHECK_INTERVAL_MS).subscribe({
        next: () => {
          this.updates.checkForUpdate().catch(() => {});
        }
      });
    });
  }

  checkForUpdate(): void {
    if (!this.updates.isEnabled) return;
    this.updates.checkForUpdate().catch(() => {});
  }

  private showUpdateDialog(): void {
    Swal.fire({
      title: '¡Nueva versión disponible!',
      text: 'Se ha detectado una nueva versión de la aplicación.',
      icon: 'info',
      showConfirmButton: true,
      allowOutsideClick: false,
      allowEscapeKey: false,
      confirmButtonText: 'Actualizar ahora',
      customClass: {
        confirmButton: 'swal2-confirm swal2-styled'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.updates
          .activateUpdate()
          .then(() => location.reload())
          .catch(() => {});
      }
    });
  }
}
