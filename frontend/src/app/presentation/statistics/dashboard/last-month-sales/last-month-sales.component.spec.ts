import { CommonTestModule } from '../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LastMonthSalesComponent } from './last-month-sales.component';

describe('LastMonthSalesComponent', () => {
  let component: LastMonthSalesComponent;
  let fixture: ComponentFixture<LastMonthSalesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LastMonthSalesComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LastMonthSalesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
