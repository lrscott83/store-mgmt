import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodaySaleCreditsHelpDialogComponent } from './today-sale-credits-help-dialog.component';

describe('TodaySaleCreditsHelpDialogComponent', () => {
  let component: TodaySaleCreditsHelpDialogComponent;
  let fixture: ComponentFixture<TodaySaleCreditsHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodaySaleCreditsHelpDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TodaySaleCreditsHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
