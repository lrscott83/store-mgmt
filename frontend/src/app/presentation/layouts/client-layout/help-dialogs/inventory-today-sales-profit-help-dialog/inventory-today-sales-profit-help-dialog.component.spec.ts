import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InventoryTodaySalesProfitHelpDialogComponent } from './inventory-today-sales-profit-help-dialog.component';

describe('InventoryTodaySalesProfitHelpDialogComponent', () => {
  let component: InventoryTodaySalesProfitHelpDialogComponent;
  let fixture: ComponentFixture<InventoryTodaySalesProfitHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryTodaySalesProfitHelpDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InventoryTodaySalesProfitHelpDialogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
