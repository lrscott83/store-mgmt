import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditResellerComponent } from './edit-reseller.component';

describe('EditResellerComponent', () => {
  let component: EditResellerComponent;
  let fixture: ComponentFixture<EditResellerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditResellerComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(EditResellerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
