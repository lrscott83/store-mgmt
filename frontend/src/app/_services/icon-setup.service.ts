import { Injectable } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

@Injectable({ providedIn: 'root' })
export class IconSetupService {
  constructor(
    private matIconRegistry: MatIconRegistry,
    private domSanitizer: DomSanitizer
  ) {}

  init(): void {
    this.matIconRegistry.setFontRegisterClass(
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/material-icons.woff2')
    );
  }
}
