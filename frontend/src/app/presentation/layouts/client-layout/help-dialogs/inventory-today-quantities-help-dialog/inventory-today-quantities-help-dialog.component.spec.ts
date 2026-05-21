import { CommonTestModule } from '../../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InventoryTodayQuantitiesHelpDialogComponent } from './inventory-today-quantities-help-dialog.component';

describe('InventoryTodayQuantitiesHelpDialogComponent', () => {
  let component: InventoryTodayQuantitiesHelpDialogComponent;
  let fixture: ComponentFixture<InventoryTodayQuantitiesHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryTodayQuantitiesHelpDialogComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InventoryTodayQuantitiesHelpDialogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
