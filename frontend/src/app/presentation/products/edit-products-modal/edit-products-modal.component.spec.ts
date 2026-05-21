import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditProductsModalComponent } from './edit-products-modal.component';

describe('EditProductsModalComponent', () => {
  let component: EditProductsModalComponent;
  let fixture: ComponentFixture<EditProductsModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditProductsModalComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditProductsModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
