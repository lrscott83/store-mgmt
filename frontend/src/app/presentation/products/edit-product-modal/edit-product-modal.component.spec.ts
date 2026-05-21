import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditProductModalComponent } from './edit-product-modal.component';
import { ProductCategory } from 'src/app/domain/entities/product-categories/product-category.model';

describe('EditProductModalComponent', () => {
  let component: EditProductModalComponent;
  let fixture: ComponentFixture<EditProductModalComponent>;

  // Mock data for testing CREATE mode (no product.id needed)
  const mockCategory: ProductCategory = {
    id: 'cat-1',
    name: 'Test Category',
    order: 1,
    isActive: true
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditProductModalComponent, CommonTestModule]
    }).compileComponents();

    fixture = TestBed.createComponent(EditProductModalComponent);
    component = fixture.componentInstance;

    // Set up @Input for CREATE mode (no product, just category)
    component.category = mockCategory;
    component.product = undefined; // This makes it work as "create new product"

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
