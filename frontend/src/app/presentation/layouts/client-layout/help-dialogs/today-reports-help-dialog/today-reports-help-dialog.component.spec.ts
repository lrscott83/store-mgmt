import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodayReportsHelpDialogComponent } from './today-reports-help-dialog.component';

describe('TodayReportsHelpDialogComponent', () => {
  let component: TodayReportsHelpDialogComponent;
  let fixture: ComponentFixture<TodayReportsHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodayReportsHelpDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TodayReportsHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
