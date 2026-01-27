// Angular import
import { Component, Input, OnDestroy, Inject, ViewEncapsulation, effect, signal } from '@angular/core';
import { Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { DOCUMENT } from '@angular/common';

// project import
import { Spinkit } from './spinkits';

@Component({
    selector: 'app-spinner',
    templateUrl: './spinner.component.html',
    styleUrls: ['./spinner.component.scss', './spinkit-css/sk-line-material.scss'],
    encapsulation: ViewEncapsulation.None,
    standalone: false
})
export class SpinnerComponent implements OnDestroy {
  // public props
  isSpinnerVisible = true;
  Spinkit = Spinkit;
  @Input() backgroundColor = '#1890ff';
  @Input() spinner = Spinkit.skLine;

  // isLoading = signal(false);

  // Constructor
  constructor(
    private router: Router,
    @Inject(DOCUMENT) private document: Document
  ) {
    // effect(() => {
    //   const spinner = document.getElementById('loading-spinner');
    //   if (spinner) {
    //     if (this.isLoading()) {
    //       spinner.style.display = 'block'; // Show spinner
    //     } else {
    //       spinner.style.display = 'none'; // Hide spinner
    //     }
    //   }
    // });

    this.router.events.subscribe(
      (event) => {
        if (event instanceof NavigationStart) {
          //this.isSpinnerVisible = true;
          console.log("Start: NavigationStart");
          // this.isLoading.set(true);
        } else if (event instanceof NavigationEnd || event instanceof NavigationCancel || event instanceof NavigationError) {
          // setTimeout(() => {
          //   window.scrollTo(0, 0);
          //   this.isSpinnerVisible = false;
          //   this.isLoading.set(true);

          //   // to display back the body content
          //   setTimeout(() => {
          //     document.body.classList.add('page-loaded');
          //   }, 500);
          // }, 10000); // Simulate 2 seconds delay
          this.isSpinnerVisible = false;
          console.log("End: " + event);
        } else {
          console.log("Other Router event: " + event);
        }
      },
      () => {
        this.isSpinnerVisible = false;
      }
    );
  }

  // life cycle event
  ngOnDestroy(): void {
    this.isSpinnerVisible = false;
  }
}
