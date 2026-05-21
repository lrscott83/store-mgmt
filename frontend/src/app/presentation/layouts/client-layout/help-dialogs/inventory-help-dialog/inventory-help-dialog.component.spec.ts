import { CommonTestModule } from '../../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InventoryHelpDialogComponent } from './inventory-help-dialog.component';

describe('InventoryHelpDialogComponent', () => {
  let component: InventoryHelpDialogComponent;
  let fixture: ComponentFixture<InventoryHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InventoryHelpDialogComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InventoryHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
