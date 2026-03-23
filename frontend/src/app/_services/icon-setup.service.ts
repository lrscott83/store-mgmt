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
    // Register Material Icons font alias from local assets
    this.matIconRegistry.registerFontClassAlias('material-icons', 'material-icons');

    // Set as default font for mat-icon components
    this.matIconRegistry.setDefaultFontSetClass('material-icons');
  }
}
