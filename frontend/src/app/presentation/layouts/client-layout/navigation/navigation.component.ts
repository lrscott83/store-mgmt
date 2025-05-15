// Angular import
import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

// project import
import { NavContentComponent } from './nav-content/nav-content.component';
import { SharedModule } from 'src/app/presentation/shared/shared.module';

@Component({
  selector: 'app-navigation',
  standalone: true,
  imports: [SharedModule, NavContentComponent, CommonModule],
  templateUrl: './navigation.component.html',
  styleUrls: ['./navigation.component.scss']
})
export class NavigationComponent {
  // media 1025 After Use Menu Open
  @Output() NavCollapsedMob = new EventEmitter();
  @Output() NavCollapseMobile = new EventEmitter();

  navCollapsedMob;
  windowWidth: number;

  // Constructor
  constructor() {
    this.windowWidth = window.innerWidth;
    this.navCollapsedMob = false;
  }

  // public method
  navCollapseMob() {
    if (this.windowWidth < 1025) {
      this.NavCollapsedMob.emit();
    }
  }

  // public method
  navCollapseMobile() {
    if (this.windowWidth < 1025) {
      this.NavCollapseMobile.emit();
    }
  }

  isMobile(): boolean {
    return this.windowWidth < 1025;
  }
}
