import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaleProductRowComponent } from './sale-product-row.component';

describe('SaleProductRowComponent', () => {
  let component: SaleProductRowComponent;
  let fixture: ComponentFixture<SaleProductRowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaleProductRowComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SaleProductRowComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
