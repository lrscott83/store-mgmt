import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodayExpenseHelpDialogComponent } from './today-expense-help-dialog.component';

describe('TodayExpenseHelpDialogComponent', () => {
  let component: TodayExpenseHelpDialogComponent;
  let fixture: ComponentFixture<TodayExpenseHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodayExpenseHelpDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TodayExpenseHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
