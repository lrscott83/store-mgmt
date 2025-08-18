import { Injectable } from '@angular/core';
import { fromEvent, Observable, BehaviorSubject, merge, of } from 'rxjs';
import { startWith, shareReplay, map, throttleTime, tap, switchMap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

@Injectable({
    providedIn: 'root'
})
export class ConnectionService {
    static API_URL = `${environment.apiUrl}/${environment.apiVersion}/auth/`;
    private connectionStatus$ = new BehaviorSubject<boolean>(navigator.onLine);

    constructor() {
        // Escuchar eventos de conexión [[1]][[3]]
        // fromEvent(window, 'online').subscribe(() => this.updateStatus(true));
        // fromEvent(window, 'offline').subscribe(() => this.updateStatus(false));

        merge(
            fromEvent(window, 'online').pipe(map(() => true)),
            fromEvent(window, 'offline').pipe(map(() => false)),
            this.periodicCheck().pipe(
                throttleTime(5000), // Verificar cada 5 segundos [[3]]
                tap(online => this.updateStatus(online))
            )
        ).subscribe(online => this.updateStatus(online));
    }

    private periodicCheck(): Observable<boolean> {
        return of(null).pipe(
            switchMap(() => fetch(ConnectionService.API_URL + 'ping') // Endpoint de verificación [[6]]
                .then(() => {
                    console.log("Connection OK");
                    return true;
                })
                .catch(() => {
                    console.log("Connection Error");
                    return false;
                })
            )
        );
    }

    private updateStatus(status: boolean) {
        this.connectionStatus$.next(status);
    }

    getStatus(): Observable<boolean> {
        // return this.connectionStatus$.asObservable().pipe(
        //     startWith(navigator.onLine), // Estado inicial [[6]]
        //     shareReplay(1) // Compartir última emisión [[3]]
        // );

        return this.connectionStatus$.asObservable().pipe(
            startWith(navigator.onLine)
        );
    }

    get currentStatusValue(): boolean {
        return this.connectionStatus$.value;
    }
}