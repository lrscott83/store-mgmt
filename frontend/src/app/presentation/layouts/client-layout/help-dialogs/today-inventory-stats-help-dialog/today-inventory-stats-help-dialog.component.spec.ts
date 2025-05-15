import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodayInventoryStatsHelpDialogComponent } from './today-inventory-stats-help-dialog.component';

describe('TodayInventoryStatsHelpDialogComponent', () => {
  let component: TodayInventoryStatsHelpDialogComponent;
  let fixture: ComponentFixture<TodayInventoryStatsHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodayInventoryStatsHelpDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TodayInventoryStatsHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
