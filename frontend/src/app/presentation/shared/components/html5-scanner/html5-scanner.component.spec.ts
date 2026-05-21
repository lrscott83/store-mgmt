import { CommonTestModule } from '../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Html5ScannerComponent } from './html5-scanner.component';

describe('Html5ScannerComponent', () => {
  let component: Html5ScannerComponent;
  let fixture: ComponentFixture<Html5ScannerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Html5ScannerComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Html5ScannerComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
