import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InventoryTodaySaleComponent } from './inventory-today-sale.component';

describe('InventoryTodaySaleComponent', () => {
  let component: InventoryTodaySaleComponent;
  let fixture: ComponentFixture<InventoryTodaySaleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryTodaySaleComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(InventoryTodaySaleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
