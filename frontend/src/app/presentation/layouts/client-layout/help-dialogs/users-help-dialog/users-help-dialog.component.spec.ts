import { ComponentFixture, TestBed } from '@angular/core/testing';

import { UsersHelpDialogComponent } from './users-help-dialog.component';

describe('UsersHelpDialogComponent', () => {
  let component: UsersHelpDialogComponent;
  let fixture: ComponentFixture<UsersHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UsersHelpDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(UsersHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
