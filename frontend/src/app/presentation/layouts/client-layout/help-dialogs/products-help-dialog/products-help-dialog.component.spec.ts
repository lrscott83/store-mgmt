import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductsHelpDialogComponent } from './products-help-dialog.component';

describe('ProductsHelpDialogComponent', () => {
  let component: ProductsHelpDialogComponent;
  let fixture: ComponentFixture<ProductsHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductsHelpDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ProductsHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
