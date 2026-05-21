import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InventoryProductListComponent } from './inventory-product-list.component';

describe('InventoryProductListComponent', () => {
  let component: InventoryProductListComponent;
  let fixture: ComponentFixture<InventoryProductListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryProductListComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(InventoryProductListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
