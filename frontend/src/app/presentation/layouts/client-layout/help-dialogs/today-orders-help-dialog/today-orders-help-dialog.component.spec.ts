import { CommonTestModule } from '../../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodayOrdersHelpDialogComponent } from './today-orders-help-dialog.component';

describe('TodayOrdersHelpDialogComponent', () => {
  let component: TodayOrdersHelpDialogComponent;
  let fixture: ComponentFixture<TodayOrdersHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodayOrdersHelpDialogComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TodayOrdersHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
