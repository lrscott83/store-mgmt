import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaleCreditPaymentModalComponent } from './sale-credit-payment-modal.component';

describe('SaleCreditPaymentModalComponent', () => {
  let component: SaleCreditPaymentModalComponent;
  let fixture: ComponentFixture<SaleCreditPaymentModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaleCreditPaymentModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SaleCreditPaymentModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
