import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LastMonthSaleProfitsComponent } from './last-month-sale-profits.component';

describe('LastMonthSaleProfitsComponent', () => {
  let component: LastMonthSaleProfitsComponent;
  let fixture: ComponentFixture<LastMonthSaleProfitsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LastMonthSaleProfitsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LastMonthSaleProfitsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
