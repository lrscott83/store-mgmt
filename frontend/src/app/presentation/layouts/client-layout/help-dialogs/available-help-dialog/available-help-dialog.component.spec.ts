import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AvailableHelpDialogComponent } from './available-help-dialog.component';

describe('AvailableHelpDialogComponent', () => {
  let component: AvailableHelpDialogComponent;
  let fixture: ComponentFixture<AvailableHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvailableHelpDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AvailableHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
