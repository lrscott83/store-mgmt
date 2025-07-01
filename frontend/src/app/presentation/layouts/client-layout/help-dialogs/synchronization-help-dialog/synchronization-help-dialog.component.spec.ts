import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SynchronizationHelpDialogComponent } from './synchronization-help-dialog.component';

describe('SynchronizationHelpDialogComponent', () => {
  let component: SynchronizationHelpDialogComponent;
  let fixture: ComponentFixture<SynchronizationHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SynchronizationHelpDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SynchronizationHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
