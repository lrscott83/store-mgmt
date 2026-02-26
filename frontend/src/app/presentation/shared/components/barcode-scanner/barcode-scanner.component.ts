import { Component, EventEmitter, Input, Output, OnDestroy, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { BarcodeFormat, BrowserMultiFormatReader } from '@zxing/browser';
import { Result } from '@zxing/library';

@Component({
  selector: 'app-barcode-scanner',
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule],
  templateUrl: './barcode-scanner.component.html',
  styleUrl: './barcode-scanner.component.scss'
})
export class BarcodeScannerComponent implements OnDestroy, AfterViewInit {
  @Input() modalReference: any;
  @Output() barcodeScanned: EventEmitter<string> = new EventEmitter<string>();
  @ViewChild('videoElement') videoElementRef!: ElementRef<HTMLVideoElement>;

  isScanning = false;
  availableCameras: MediaDeviceInfo[] = [];
  selectedCamera: MediaDeviceInfo | null = null;
  hasPermission = true;
  errorMessage = '';
  lastScannedCode = '';

  private codeReader: BrowserMultiFormatReader;
  private stream: MediaStream | null = null;

  constructor(private modalService: NgbModal) {
    this.codeReader = new BrowserMultiFormatReader();
  }

  async ngAfterViewInit(): Promise<void> {
    setTimeout(async () => {
      await this.getAvailableCameras();
      if (this.hasPermission && this.selectedCamera) {
        await this.startScanning();
      }
    }, 500);
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
      this.errorMessage = 'Camera permission denied';
    }
  }

  async startScanning(): Promise<void> {
    console.log('[BarcodeScanner] startScanning called');
    if (!this.videoElementRef?.nativeElement) {
      console.log('[BarcodeScanner] Video element not ready');
      this.errorMessage = 'Video element not ready';
      return;
    }

    if (this.availableCameras.length === 0) {
      console.log('[BarcodeScanner] No cameras found, calling getAvailableCameras');
      await this.getAvailableCameras();
    }

    if (!this.selectedCamera) {
      console.log('[BarcodeScanner] No selectedCamera');
      this.errorMessage = 'No camera available';
      return;
    }

    const videoElement = this.videoElementRef.nativeElement;
    this.isScanning = true;
    this.errorMessage = '';
    console.log('[BarcodeScanner] Starting camera, selectedCamera:', this.selectedCamera);

    try {
      console.log('[BarcodeScanner] Requesting getUserMedia');
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: this.selectedCamera.deviceId,
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      videoElement.srcObject = this.stream;
      videoElement.play();

      console.log('[BarcodeScanner] Calling continuousScan');
      this.continuousScan();
    } catch (err: any) {
      console.error('[BarcodeScanner] Error starting camera:', err);
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
    console.log('[BarcodeScanner] continuousScan called');
    if (!this.isScanning || !this.videoElementRef?.nativeElement) {
      console.log(
        '[BarcodeScanner] continuousScan early return, isScanning:',
        this.isScanning,
        'videoElement:',
        !!this.videoElementRef?.nativeElement
      );
      return;
    }

    const videoElement = this.videoElementRef.nativeElement;
    const deviceId = this.selectedCamera?.deviceId;
    console.log('[BarcodeScanner] deviceId:', deviceId);

    if (deviceId) {
      this.codeReader.decodeFromVideoDevice(deviceId, videoElement, (result: Result | null, error: any) => {
        if (result) {
          const code = result.getText();
          console.log('[BarcodeScanner] Code read:', code);
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
          console.log('[BarcodeScanner] Code read:', code);
          if (code && code !== this.lastScannedCode) {
            this.lastScannedCode = code;
            this.onBarcodeDetected(code);
          }
        }
      });
    }
  }

  private onBarcodeDetected(code: string): void {
    if ('vibrate' in navigator) {
      navigator.vibrate(200);
    }
    this.barcodeScanned.emit(code);
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
    this.stopScanning();
    if (this.modalReference) {
      this.modalReference.close();
    }
  }

  ngOnDestroy(): void {
    this.stopScanning();
  }
}
