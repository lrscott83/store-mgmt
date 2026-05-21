import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditInventoryEntryModalComponent } from './edit-inventory-entry-modal.component';

describe('EditInventoryEntryModalComponent', () => {
  let component: EditInventoryEntryModalComponent;
  let fixture: ComponentFixture<EditInventoryEntryModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditInventoryEntryModalComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(EditInventoryEntryModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
