import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EntriesHelpDialogComponent } from './entries-help-dialog.component';

describe('EntriesHelpDialogComponent', () => {
  let component: EntriesHelpDialogComponent;
  let fixture: ComponentFixture<EntriesHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EntriesHelpDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(EntriesHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
