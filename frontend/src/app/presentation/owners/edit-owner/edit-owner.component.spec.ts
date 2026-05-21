import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditOwnerComponent } from './edit-owner.component';

describe('EditOwnerComponent', () => {
  let component: EditOwnerComponent;
  let fixture: ComponentFixture<EditOwnerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditOwnerComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(EditOwnerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
