// Angular Imports
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

// project import
import { BreadcrumbComponent } from './components/breadcrumb/breadcrumb.component';
import { SpinnerComponent } from './components/spinner/spinner.component';
import { CardComponent } from './components/card/card.component';

// third party
import { NgScrollbarModule } from 'ngx-scrollbar';
import { IconDirective } from '@ant-design/icons-angular';

// bootstrap import
import { NgbDropdownModule, NgbNavModule, NgbModule, NgbCollapseModule } from '@ng-bootstrap/ng-bootstrap';
import { LoadingSpinnerComponent } from './components/loading-spinner/loading-spinner.component';

// Angular Material core
import { MatNativeDateModule, MAT_DATE_LOCALE } from '@angular/material/core';

// Angular Material - Form Controls (USED: 87+ form-fields, 11+ selects, 12+ toggles, 2+ checkboxes, 16+ radio-buttons, 2 datepickers)
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatDatepickerModule } from '@angular/material/datepicker';

// Angular Material - Layout & Display (USED: 14 cards, 10 menus, 4 dividers, 28+ expansion-panels, 10 accordions)
import { MatCardModule } from '@angular/material/card';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';

// Angular Material - Icons (USED: 133+ icons)
import { MatIconModule } from '@angular/material/icon';

// Angular Material - Buttons & Indicators (USED: buttons in forms)
import { MatButtonModule } from '@angular/material/button';

// Angular Material - NOT USED - removed for tree-shaking:
// - MatDialogModule (NgbModal used instead)
// - MatSnackBarModule
// - MatTooltipModule
// - MatProgressBarModule
// - MatProgressSpinnerModule
// - MatTabsModule
// - MatSidenavModule
// - MatListModule
// - MatToolbarModule
// - MatAutocompleteModule
// - MatSliderModule
// - MatGridListModule
// - MatButtonToggleModule
// - MatTreeModule
// - MatPaginatorModule
// - MatSortModule
// - MatTableModule
// - MatChipsModule
// - MatStepperModule
// - MatBottomSheetModule
// - MatRippleModule

import { NgxMaskDirective, NgxMaskPipe, provideNgxMask } from 'ngx-mask';
import { DownloadProgressComponent } from '../download-progress/download-progress.component';
import { FileSizePipe } from 'src/app/_shared/pipes/file-size/file-size.pipe';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    BreadcrumbComponent,
    NgbDropdownModule,
    NgbNavModule,
    NgbModule,
    NgbCollapseModule,
    NgScrollbarModule,
    CardComponent,
    IconDirective,
    // Form Controls
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatCheckboxModule,
    MatRadioModule,
    MatDatepickerModule,
    MatNativeDateModule,
    // Layout & Display
    MatCardModule,
    MatMenuModule,
    MatDividerModule,
    MatExpansionModule,
    // Icons & Buttons
    MatIconModule,
    MatButtonModule,
    // Mask
    NgxMaskDirective,
    NgxMaskPipe
  ],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    BreadcrumbComponent,
    SpinnerComponent,
    NgbModule,
    NgbDropdownModule,
    NgbNavModule,
    NgbCollapseModule,
    NgScrollbarModule,
    CardComponent,
    IconDirective,
    LoadingSpinnerComponent,
    // Form Controls
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatCheckboxModule,
    MatRadioModule,
    MatDatepickerModule,
    MatNativeDateModule,
    // Layout & Display
    MatCardModule,
    MatMenuModule,
    MatDividerModule,
    MatExpansionModule,
    // Icons & Buttons
    MatIconModule,
    MatButtonModule,
    // Mask
    NgxMaskDirective,
    NgxMaskPipe,
    // Components & Pipes
    DownloadProgressComponent,
    FileSizePipe
  ],
  declarations: [SpinnerComponent, LoadingSpinnerComponent, DownloadProgressComponent, FileSizePipe],
  providers: [{ provide: MAT_DATE_LOCALE, useValue: 'es-ES' }, provideNgxMask()]
})
export class SharedModule {}
