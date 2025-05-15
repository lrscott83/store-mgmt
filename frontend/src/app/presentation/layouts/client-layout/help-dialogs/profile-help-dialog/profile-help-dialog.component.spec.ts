import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProfileHelpDialogComponent } from './profile-help-dialog.component';

describe('ProfileHelpDialogComponent', () => {
  let component: ProfileHelpDialogComponent;
  let fixture: ComponentFixture<ProfileHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileHelpDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ProfileHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
