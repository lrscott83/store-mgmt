import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SendHelpDialogComponent } from './send-help-dialog.component';

describe('SendHelpDialogComponent', () => {
  let component: SendHelpDialogComponent;
  let fixture: ComponentFixture<SendHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SendHelpDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(SendHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
