import { CommonTestModule } from '../../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProfileHelpDialogComponent } from './profile-help-dialog.component';

describe('ProfileHelpDialogComponent', () => {
  let component: ProfileHelpDialogComponent;
  let fixture: ComponentFixture<ProfileHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileHelpDialogComponent, CommonTestModule]
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
