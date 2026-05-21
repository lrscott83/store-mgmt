import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaleCategoryProductsComponent } from './sale-category-products.component';

describe('SaleCategoryProductsComponent', () => {
  let component: SaleCategoryProductsComponent;
  let fixture: ComponentFixture<SaleCategoryProductsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaleCategoryProductsComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(SaleCategoryProductsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
