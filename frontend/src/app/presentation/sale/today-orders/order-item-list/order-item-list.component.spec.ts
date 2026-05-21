import { CommonTestModule } from '../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrderItemListComponent } from './order-item-list.component';

describe('OrderItemListComponent', () => {
  let component: OrderItemListComponent;
  let fixture: ComponentFixture<OrderItemListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrderItemListComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(OrderItemListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
