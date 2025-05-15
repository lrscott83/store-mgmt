import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StoresHelpDialogComponent } from './stores-help-dialog.component';

describe('StoresHelpDialogComponent', () => {
  let component: StoresHelpDialogComponent;
  let fixture: ComponentFixture<StoresHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StoresHelpDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(StoresHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
