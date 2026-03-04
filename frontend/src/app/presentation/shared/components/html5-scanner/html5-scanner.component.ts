import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { error } from 'console';
import { Html5Qrcode } from 'html5-qrcode';

@Component({
  selector: 'app-html5-scanner',
  imports: [],
  templateUrl: './html5-scanner.component.html',
  styleUrl: './html5-scanner.component.scss',
})
export class Html5ScannerComponent implements AfterViewInit, OnDestroy {

  barcode: string | null = null;
  private html5QrCode!: Html5Qrcode;

  ngAfterViewInit() {
    this.html5QrCode = new Html5Qrcode("reader");

    this.html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      (decodedText) => {
        this.barcode = decodedText;
        this.html5QrCode.stop();
      },
      (errorMessage, error) => {
        this.barcode = errorMessage;
        console.warn("Error scanning: " + errorMessage);
      }
    );
  }

  ngOnDestroy() {
    if (this.html5QrCode) {
      this.html5QrCode.stop();
    }
  }

}
