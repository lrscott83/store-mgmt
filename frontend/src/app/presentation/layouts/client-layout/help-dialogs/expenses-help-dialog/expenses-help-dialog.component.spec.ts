import { CommonTestModule } from '../../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpensesHelpDialogComponent } from './expenses-help-dialog.component';

describe('ExpensesHelpDialogComponent', () => {
  let component: ExpensesHelpDialogComponent;
  let fixture: ComponentFixture<ExpensesHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpensesHelpDialogComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExpensesHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
