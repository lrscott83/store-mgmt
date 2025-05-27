// angular import
import { Component, effect, signal } from '@angular/core';
import { TranslationService } from './_modules/i18n/translation.service';

// language list
import { locale as enLang } from './_modules/i18n/vocabs/en';
import { locale as chLang } from './_modules/i18n/vocabs/ch';
import { locale as esLang } from './_modules/i18n/vocabs/es';
import { locale as jpLang } from './_modules/i18n/vocabs/jp';
import { locale as deLang } from './_modules/i18n/vocabs/de';
import { locale as frLang } from './_modules/i18n/vocabs/fr';
import { Subscription } from 'rxjs';
import { SpinnerComponent } from './presentation/shared/components/spinner/spinner.component';
import { LoadingComponent } from './presentation/shared/components/loading/loading.component';
import { UpdateService } from './_services/update/update.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  // public props
  title = 'vende-de-todo';
  public spinnerComponent = LoadingComponent;

  constructor(
    private translationService: TranslationService,
    private updateService: UpdateService,
    //private tableService: TableExtendedService
  ) {
    // register translations
    this.translationService.loadTranslations(
      esLang,
      enLang,
      chLang,
      jpLang,
      deLang,
      frLang
    );
  }
}
