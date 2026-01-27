import { Component } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ToastrService } from 'ngx-toastr';
import { catchError } from 'rxjs';
import { FeatureService } from 'src/app/_services/features/feature.service';
import { SharedModule } from '../shared/shared.module';

@Component({
    selector: 'app-features',
    imports: [SharedModule, TranslateModule],
    templateUrl: './features.component.html',
    styleUrl: './features.component.scss'
})
export class FeaturesComponent {

  constructor(private featureService: FeatureService, private toastrService: ToastrService, private translate: TranslateService) {

  }

  activateFeatures() {
    this.featureService.activateFeatures()
      .pipe(catchError((error) => {
        this.toastrService.error(
          this.translate.instant('FEATURES.UNEXPECTED_ERROR'),
          this.translate.instant('GENERAL.RESPONSE.ERROR'));
        throw error;
      }))
      .subscribe(response => {
        if (response?.succeeded)
          this.toastrService.success(
            this.translate.instant('FEATURES.FEATURES_ACTIVATED'),
            this.translate.instant('GENERAL.RESPONSE.SUCCESS_TITLE'));
        else
          this.toastrService.error(
            this.translate.instant('FEATURES.UNEXPECTED_ERROR'),
            this.translate.instant('GENERAL.RESPONSE.ERROR'));
      });
  }
}
