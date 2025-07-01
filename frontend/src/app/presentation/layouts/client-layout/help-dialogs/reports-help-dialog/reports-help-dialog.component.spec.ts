import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReportsHelpDialogComponent } from './reports-help-dialog.component';

describe('ReportsHelpDialogComponent', () => {
  let component: ReportsHelpDialogComponent;
  let fixture: ComponentFixture<ReportsHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReportsHelpDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReportsHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
