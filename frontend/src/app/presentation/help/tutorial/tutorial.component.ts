import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { SharedModule } from '../../shared/shared.module';

// icons
import { IconService } from '@ant-design/icons-angular';
import { MenuUnfoldOutline, MenuFoldOutline, SearchOutline } from '@ant-design/icons-angular/icons';

@Component({
    selector: 'app-tutorial',
    imports: [SharedModule, TranslateModule],
    templateUrl: './tutorial.component.html',
    styleUrl: './tutorial.component.scss'
})
export class TutorialComponent {
  constructor(private iconService: IconService) {
    this.iconService.addIcon(...[MenuUnfoldOutline, MenuFoldOutline, SearchOutline]);
  }
}
