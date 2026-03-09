import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
// import { SwUpdate } from '@angular/service-worker';

@Injectable({
  providedIn: 'root'
})
export class DownloadManagerService {
  private progressSubject = new BehaviorSubject<number>(0);
  private isDownloadingSubject = new BehaviorSubject<boolean>(false);
  private totalSizeSubject = new BehaviorSubject<number>(0);
  private downloadedSizeSubject = new BehaviorSubject<number>(0);

  progress$: Observable<number> = this.progressSubject.asObservable();
  isDownloading$: Observable<boolean> = this.isDownloadingSubject.asObservable();
  totalSize$: Observable<number> = this.totalSizeSubject.asObservable();
  downloadedSize$: Observable<number> = this.downloadedSizeSubject.asObservable();

  private totalFiles = 0;
  private downloadedFiles = 0;
  private estimatedTotalSize = 0;

  constructor(
    // private swUpdate: SwUpdate, 
    private ngZone: NgZone) {
    this.setupServiceWorkerEvents();
    this.calculateAppSize();
  }

  private calculateAppSize(): void {
    // Estimar tamaño total de la aplicación
    const links = document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]');
    const scripts = document.querySelectorAll<HTMLScriptElement>('script[src]');
    
    let total = 0;
    
    // Sumar tamaño de CSS
    links.forEach(link => {
      total += this.estimateResourceSize(link.href);
    });
    
    // Sumar tamaño de JS
    scripts.forEach(script => {
      if (script.src && !script.src.includes('hot-update')) {
        total += this.estimateResourceSize(script.src);
      }
    });
    
    // Agregar tamaño estimado de otros recursos
    total += 100000; // ~100KB para HTML, imágenes, etc.
    
    this.estimatedTotalSize = total;
    this.totalSizeSubject.next(total);
  }

  private estimateResourceSize(url: string): number {
    // Valores estimados típicos
    if (url.includes('.css')) return 50000; // ~50KB
    if (url.includes('.js')) return 150000; // ~150KB
    return 30000; // ~30KB para otros
  }

  private setupServiceWorkerEvents(): void {
    console.log('setupServiceWorkerEvents');
    if ('serviceWorker' in navigator) {
      console.log('serviceWorker in navigator');
      navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('navigator.serviceWorker.addEventListener(message) with event: ' + JSON.stringify(event));
        this.ngZone.run(() => {
          this.handleServiceWorkerMessage(event.data);
        });
      });
    }
  }

  private handleServiceWorkerMessage(message: any): void {
    console.log('handleServiceWorkerMessage with message: ' +JSON.stringify(message));
    if (message.type === 'INSTALLING') {
      this.isDownloadingSubject.next(true);
      this.progressSubject.next(0);
    }
    
    if (message.type === 'DOWNLOADING') {
      const { downloaded, total } = message.payload;
      this.downloadedFiles = downloaded;
      this.totalFiles = total;
      
      const progress = total > 0 ? Math.round((downloaded / total) * 100) : 0;
      this.progressSubject.next(progress);
      
      // Calcular tamaño descargado estimado
      const downloadedSize = (downloaded / total) * this.estimatedTotalSize;
      this.downloadedSizeSubject.next(downloadedSize);
    }
    
    if (message.type === 'INSTALLED') {
      setTimeout(() => {
        this.isDownloadingSubject.next(false);
        this.progressSubject.next(100);
      }, 1000);
    }
  }

  startDownload(): void {
    console.log('startDownload');
    this.isDownloadingSubject.next(true);
    this.progressSubject.next(0);
    this.downloadedSizeSubject.next(0);
  }

  updateProgress(progress: number): void {
    console.log('updateProgress with progress: ' + progress);
    this.progressSubject.next(progress);
    const downloadedSize = (progress / 100) * this.estimatedTotalSize;
    this.downloadedSizeSubject.next(downloadedSize);
  }

  completeDownload(): void {
    console.log('completeDownload');
    this.progressSubject.next(100);
    setTimeout(() => {
      this.isDownloadingSubject.next(false);
    }, 1500);
  }
}
