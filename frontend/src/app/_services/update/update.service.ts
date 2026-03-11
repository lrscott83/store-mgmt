// src/app/services/update.service.ts
import { Injectable } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { interval } from 'rxjs';
import Swal from 'sweetalert2';

@Injectable({ providedIn: 'root' })
export class UpdateService {
  constructor(
    private updates: SwUpdate,
    private snackbar: MatSnackBar
  ) {
    if (this.updates.isEnabled) {
      // Escuchar cuando haya una nueva versión disponible
      this.updates.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') {
          this.showUpdateDialog();
          // const snack = this.snackbar.open(
          //     'Hay una nueva versión disponible',
          //     'Actualizar',
          //     { duration: 6000 }
          // );

          // snack.onAction().subscribe(() => {
          //     this.updates.activateUpdate().then(() => location.reload());
          // });
        }
      });

      // Verificar periódicamente si hay actualizaciones
      interval(60 * 60 * 1000).subscribe(() => this.updates.checkForUpdate());
    }
  }

  public checkForUpdate() {
    if (this.updates) this.updates.checkForUpdate();
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
        this.updates.activateUpdate().then(() => location.reload());
      }
    });
  }
}
