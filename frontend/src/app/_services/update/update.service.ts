// src/app/services/update.service.ts
import { Injectable } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { MatSnackBar } from '@angular/material/snack-bar';
import { interval } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UpdateService {
    constructor(private updates: SwUpdate, private snackbar: MatSnackBar) {
        if (this.updates.isEnabled) {
            // Escuchar cuando haya una nueva versión disponible
            this.updates.versionUpdates.subscribe(event => {
                if (event.type === 'VERSION_READY') {
                    const snack = this.snackbar.open(
                        'Hay una nueva versión disponible',
                        'Actualizar',
                        { duration: 6000 }
                    );

                    snack.onAction().subscribe(() => {
                        this.updates.activateUpdate().then(() => location.reload());
                    });
                }
            });

            // Verificar periódicamente si hay actualizaciones
            interval(6 * 60 * 1000).subscribe(() => this.updates.checkForUpdate());
        }
    }
}
