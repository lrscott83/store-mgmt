import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OwnersHelpDialogComponent } from './owners-help-dialog.component';

describe('OwnersHelpDialogComponent', () => {
  let component: OwnersHelpDialogComponent;
  let fixture: ComponentFixture<OwnersHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OwnersHelpDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(OwnersHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
