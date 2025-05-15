import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReceiveHelpDialogComponent } from './receive-help-dialog.component';

describe('ReceiveHelpDialogComponent', () => {
  let component: ReceiveHelpDialogComponent;
  let fixture: ComponentFixture<ReceiveHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceiveHelpDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ReceiveHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
