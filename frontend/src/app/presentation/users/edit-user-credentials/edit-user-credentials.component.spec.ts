import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditUserCredentialsComponent } from './edit-user-credentials.component';

describe('EditUserCredentialsComponent', () => {
  let component: EditUserCredentialsComponent;
  let fixture: ComponentFixture<EditUserCredentialsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditUserCredentialsComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(EditUserCredentialsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
