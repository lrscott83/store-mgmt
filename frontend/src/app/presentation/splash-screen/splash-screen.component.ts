import { Component, ElementRef, NgModule, OnInit, ViewChild } from '@angular/core';
import { SplashScreenService } from './splash-screen.service';
import { SharedModule } from '../shared/shared.module';

@Component({
    selector: 'app-splash-screen',
    imports: [SharedModule],
    templateUrl: './splash-screen.component.html',
    styleUrl: './splash-screen.component.scss'
})
export class SplashScreenComponent implements OnInit {
  @ViewChild('splashScreen', { static: true }) splashScreen: ElementRef;

  constructor(
    private el: ElementRef,
    private splashScreenService: SplashScreenService
  ) {}

  ngOnInit(): void {
    this.splashScreenService.init(this.splashScreen);
  }
}
