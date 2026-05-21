import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LandingDeepComponent } from './landing-deep.component';

describe('LandingDeepComponent', () => {
  let component: LandingDeepComponent;
  let fixture: ComponentFixture<LandingDeepComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingDeepComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LandingDeepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
