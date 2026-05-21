import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditProductCategoryModalComponent } from './edit-product-category-modal.component';

describe('EditProductCategoryModalComponent', () => {
  let component: EditProductCategoryModalComponent;
  let fixture: ComponentFixture<EditProductCategoryModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditProductCategoryModalComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(EditProductCategoryModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
