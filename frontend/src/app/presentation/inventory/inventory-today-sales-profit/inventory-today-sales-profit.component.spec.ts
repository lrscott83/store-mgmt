import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InventoryTodaySalesProfitComponent } from './inventory-today-sales-profit.component';

describe('InventoryTodaySalesProfitComponent', () => {
  let component: InventoryTodaySalesProfitComponent;
  let fixture: ComponentFixture<InventoryTodaySalesProfitComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryTodaySalesProfitComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InventoryTodaySalesProfitComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
