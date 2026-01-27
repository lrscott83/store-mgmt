// Angular import
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule, Location, LocationStrategy } from '@angular/common';
import { RouterModule } from '@angular/router';

// project import
import { NavigationItem, NavigationItems } from '../navigation';
import { environment } from 'src/environments/environment';
import { NavCollapseComponent } from './nav-collapse/nav-collapse.component';
import { NavGroupComponent } from './nav-group/nav-group.component';
import { NavItemComponent } from './nav-item/nav-item.component';

// icon
import { IconService } from '@ant-design/icons-angular';
import {
  DashboardOutline,
  CreditCardOutline,
  LoginOutline,
  QuestionOutline,
  ChromeOutline,
  FontSizeOutline,
  ProfileOutline,
  BgColorsOutline,
  AntDesignOutline
} from '@ant-design/icons-angular/icons';
import { SharedModule } from 'src/app/presentation/shared/shared.module';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from 'src/app/_services/services.index';
import { AuthorizationService } from 'src/app/_services/authorization/authorization.service';
import { StoreModuleStateService } from 'src/app/_services/shared/store-module-state.service';

@Component({
    selector: 'app-nav-content',
    imports: [SharedModule, CommonModule, RouterModule, NavCollapseComponent, NavGroupComponent, NavItemComponent],
    templateUrl: './nav-content.component.html',
    styleUrls: ['./nav-content.component.scss']
})
export class NavContentComponent implements OnInit {
  // public props
  @Output() NavCollapsedMob: EventEmitter<string> = new EventEmitter();

  navigations: NavigationItem[];

  // version
  title = 'Demo application for version numbering';
  currentApplicationVersion = environment.appVersion;

  navigation = NavigationItems;
  windowWidth = window.innerWidth;

  // Constructor
  constructor(
    private location: Location,
    private locationStrategy: LocationStrategy,
    private iconService: IconService,
    private translate: TranslateService,
    private authService: AuthService,
    private authorizationService: AuthorizationService,
    private storeModuleStateService: StoreModuleStateService
  ) {
    this.iconService.addIcon(
      ...[
        DashboardOutline,
        CreditCardOutline,
        FontSizeOutline,
        LoginOutline,
        ProfileOutline,
        BgColorsOutline,
        AntDesignOutline,
        ChromeOutline,
        QuestionOutline
      ]
    );
    this.filterNavigation();
  }

  filterNavigation() {
    this.navigations = NavigationItems;
    this.navigations = this.filterItems(this.navigations!);
    this.translateItems(this.navigations);
  }

  filterItems(groups: NavigationItem[]): NavigationItem[] {
    const navigations: NavigationItem[] = [];
    for (const group of groups) {
      if (group.children) {
        const chidren: NavigationItem[] = [];
        for (const child of group.children) {
          if (!child.feature || !child.module)
            chidren.push(child);

          if (this.hasPermission(child))
            chidren.push(child);
        }
        if (chidren.length > 0) {
          group.children = chidren;
          navigations.push(group);
        }
      }
    }
    return navigations;
  }

  hasPermission(child: NavigationItem): boolean {
    return this.authorizationService.isUserAuthorize([child.feature]);
  }

  private translateItems(items: NavigationItem[]) {
    for (const item of items) {
      const trans = this.translate.instant(item.title);
      if (trans) {
        item.title = trans;
      }
      if (item.children && item.children.length > 0) {
        this.translateItems(item.children);
      }

    }
  }

  // Life cycle events
  ngOnInit() {
    if (this.windowWidth < 1025) {
      (document.querySelector('.coded-navbar') as HTMLDivElement)?.classList.add('menupos-static');
    }
    // this.storeModuleStateService.getModulesUpdatedObservable().subscribe(updated => {
    //   if (updated)
    //     this.filterNavigation();
    // });
  }

  fireOutClick() {
    let current_url = this.location.path();
    const baseHref = this.locationStrategy.getBaseHref();
    if (baseHref) {
      current_url = baseHref + this.location.path();
    }
    const link = "a.nav-link[ href='" + current_url + "' ]";
    const ele = document.querySelector(link);
    if (ele !== null && ele !== undefined) {
      const parent = ele.parentElement;
      const up_parent = parent?.parentElement?.parentElement;
      const last_parent = up_parent?.parentElement;
      if (parent?.classList.contains('coded-hasmenu')) {
        parent.classList.add('coded-trigger');
        parent.classList.add('active');
      } else if (up_parent?.classList.contains('coded-hasmenu')) {
        up_parent.classList.add('coded-trigger');
        up_parent.classList.add('active');
      } else if (last_parent?.classList.contains('coded-hasmenu')) {
        last_parent.classList.add('coded-trigger');
        last_parent.classList.add('active');
      }
    }
  }

  navMob() {
    if (this.windowWidth < 1025 && document.querySelector('app-navigation.coded-navbar')?.classList.contains('mob-open')) {
      this.NavCollapsedMob.emit();
    }
  }
}
