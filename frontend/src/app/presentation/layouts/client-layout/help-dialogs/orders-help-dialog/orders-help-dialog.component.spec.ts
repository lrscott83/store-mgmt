import { CommonTestModule } from '../../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OrdersHelpDialogComponent } from './orders-help-dialog.component';

describe('OrdersHelpDialogComponent', () => {
  let component: OrdersHelpDialogComponent;
  let fixture: ComponentFixture<OrdersHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrdersHelpDialogComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(OrdersHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
