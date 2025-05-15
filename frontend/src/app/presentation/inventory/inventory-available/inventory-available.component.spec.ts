import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InventoryAvailableComponent } from './inventory-available.component';

describe('InventoryAvailableComponent', () => {
  let component: InventoryAvailableComponent;
  let fixture: ComponentFixture<InventoryAvailableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryAvailableComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(InventoryAvailableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
