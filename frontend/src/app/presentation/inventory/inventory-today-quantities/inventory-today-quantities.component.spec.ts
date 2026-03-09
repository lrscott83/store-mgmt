import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InventoryTodayQuantitiesComponent } from './inventory-today-quantities.component';

describe('InventoryTodayQuantitiesComponent', () => {
  let component: InventoryTodayQuantitiesComponent;
  let fixture: ComponentFixture<InventoryTodayQuantitiesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryTodayQuantitiesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InventoryTodayQuantitiesComponent);
    component = fixture.componentInstance;
    // await fixture.whenStable();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
