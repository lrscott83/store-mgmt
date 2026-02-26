import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { BarcodeFormat, BrowserMultiFormatReader } from '@zxing/browser';
import { Result } from '@zxing/library';
import { Subscription } from 'rxjs';
import { SharedModule } from '../../shared/shared.module';

@Component({
  selector: 'app-quick-sale-scanner',
  standalone: true,
  imports: [SharedModule, TranslateModule],
  templateUrl: './quick-sale-scanner.component.html',
  styleUrl: './quick-sale-scanner.component.scss'
})
export class QuickSaleScannerComponent implements OnInit, OnDestroy {
  private _isOpen = false;
  @Input()
  get isOpen(): boolean {
    return this._isOpen;
  }
  set isOpen(value: boolean) {
    console.log('[QuickSaleScanner] isOpen setter called, value:', value);
    this._isOpen = value;
    if (value && !this.isScanning) {
      console.log('[QuickSaleScanner] Calling startScanning from setter');
      setTimeout(() => {
        console.log('[QuickSaleScanner] setTimeout fired, calling startScanning');
        this.startScanning();
      }, 100);
    }
  }
  @Output() barcodeScanned = new EventEmitter<string>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('videoElement') videoElementRef!: ElementRef<HTMLVideoElement>;

  isScanning = false;
  hasPermission = true;
  errorMessage = '';
  lastScannedCode = '';
  availableCameras: MediaDeviceInfo[] = [];
  selectedCamera: MediaDeviceInfo | null = null;

  private codeReader: BrowserMultiFormatReader;
  private stream: MediaStream | null = null;

  constructor() {
    console.log('[QuickSaleScanner] Constructor called');
    this.codeReader = new BrowserMultiFormatReader();
  }

  ngOnInit(): void {
    console.log('[QuickSaleScanner] ngOnInit called');
    this.getAvailableCameras();
  }

  async getAvailableCameras(): Promise<void> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableCameras = devices.filter((device) => device.kind === 'videoinput');

      if (this.availableCameras.length === 0) {
        try {
          await navigator.mediaDevices.getUserMedia({ video: true });
          const devicesAfterPermission = await navigator.mediaDevices.enumerateDevices();
          this.availableCameras = devicesAfterPermission.filter((device) => device.kind === 'videoinput');
        } catch (e) {
          this.hasPermission = false;
          this.errorMessage = 'No camera available';
          return;
        }
      }

      const rearCamera = this.availableCameras.find(
        (camera) => camera.label.toLowerCase().includes('back') || camera.label.toLowerCase().includes('rear')
      );

      this.selectedCamera = rearCamera || this.availableCameras[0] || null;
    } catch (err) {
      console.error('Error getting cameras:', err);
      this.hasPermission = false;
    }
  }

  async startScanning(): Promise<void> {
    console.log('[QuickSaleScanner] >>> startScanning START <<<');
    console.log('[QuickSaleScanner] isOpen:', this.isOpen);
    console.log('[QuickSaleScanner] videoElement exists:', !!this.videoElementRef?.nativeElement);
    console.log('[QuickSaleScanner] isScanning:', this.isScanning);
    console.log('[QuickSaleScanner] selectedCamera:', this.selectedCamera);

    if (!this.videoElementRef?.nativeElement) {
      console.log('[QuickSaleScanner] Video element NOT ready');
      return;
    }

    const videoElement = this.videoElementRef.nativeElement;
    this.isScanning = true;
    this.errorMessage = '';
    console.log('[QuickSaleScanner] Starting camera...');

    try {
      const constraints: MediaStreamConstraints = this.selectedCamera
        ? {
            video: {
              deviceId: this.selectedCamera.deviceId,
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          }
        : {
            video: {
              facingMode: 'environment',
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          };

      console.log('[QuickSaleScanner] Requesting getUserMedia...');
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[QuickSaleScanner] getUserMedia SUCCESS');

      videoElement.srcObject = this.stream;
      videoElement.play();

      console.log('[QuickSaleScanner] Calling continuousScan...');
      this.continuousScan();
      console.log('[QuickSaleScanner] >>> startScanning END <<<');
    } catch (err: any) {
      console.error('[QuickSaleScanner] Error starting camera:', err);
      this.isScanning = false;
      if (err.name === 'NotAllowedError') {
        this.hasPermission = false;
        this.errorMessage = 'Camera permission denied';
      } else {
        this.errorMessage = 'Error accessing camera';
      }
    }
  }

  private continuousScan(): void {
    if (!this.isScanning || !this.videoElementRef?.nativeElement) return;

    const videoElement = this.videoElementRef.nativeElement;
    const deviceId = this.selectedCamera?.deviceId;
    console.log('[QuickSaleScanner] Starting continuous scan with deviceId:', deviceId);

    if (deviceId) {
      this.codeReader.decodeFromVideoDevice(deviceId, videoElement, (result: Result | null, error: any) => {
        if (result) {
          const code = result.getText();
          console.log('[QuickSaleScanner] Code read:', code, 'lastScannedCode:', this.lastScannedCode);
          if (code && code !== this.lastScannedCode) {
            this.lastScannedCode = code;
            this.onBarcodeDetected(code);
          }
        }
      });
    } else {
      this.codeReader.decodeFromVideoDevice(undefined, videoElement, (result: Result | null, error: any) => {
        if (result) {
          const code = result.getText();
          console.log('[QuickSaleScanner] Code read:', code, 'lastScannedCode:', this.lastScannedCode);
          if (code && code !== this.lastScannedCode) {
            this.lastScannedCode = code;
            this.onBarcodeDetected(code);
          }
        }
      });
    }
  }

  private onBarcodeDetected(code: string): void {
    console.log('[QuickSaleScanner] Barcode detected:', code);
    if ('vibrate' in navigator) {
      navigator.vibrate(200);
    }
    this.barcodeScanned.emit(code);
    setTimeout(() => {
      this.lastScannedCode = '';
    }, 1500);
  }

  stopScanning(): void {
    this.isScanning = false;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElementRef?.nativeElement) {
      this.videoElementRef.nativeElement.srcObject = null;
    }
  }

  async openScanner(): Promise<void> {
    console.log('[QuickSaleScanner] openScanner called');
    this.isOpen = true;
    setTimeout(() => {
      console.log('[QuickSaleScanner] Calling startScanning after timeout');
      this.startScanning();
    }, 100);
  }

  async switchCamera(): Promise<void> {
    if (this.availableCameras.length <= 1) return;

    const currentIndex = this.availableCameras.findIndex((c) => c.deviceId === this.selectedCamera?.deviceId);
    const nextIndex = (currentIndex + 1) % this.availableCameras.length;
    this.selectedCamera = this.availableCameras[nextIndex];

    if (this.isScanning) {
      this.stopScanning();
      setTimeout(() => this.startScanning(), 100);
    }
  }

  close(): void {
    this.isOpen = false;
    this.stopScanning();
    this.closed.emit();
  }

  ngOnDestroy(): void {
    this.stopScanning();
  }
}
