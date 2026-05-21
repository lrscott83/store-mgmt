import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodaySaleCreditsComponent } from './today-sale-credits.component';

describe('TodaySaleCreditsComponent', () => {
  let component: TodaySaleCreditsComponent;
  let fixture: ComponentFixture<TodaySaleCreditsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodaySaleCreditsComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TodaySaleCreditsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
