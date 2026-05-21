import { CommonTestModule } from '../../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodaySalesStatsHelpDialogComponent } from './today-sales-stats-help-dialog.component';

describe('TodaySalesStatsHelpDialogComponent', () => {
  let component: TodaySalesStatsHelpDialogComponent;
  let fixture: ComponentFixture<TodaySalesStatsHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodaySalesStatsHelpDialogComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TodaySalesStatsHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
