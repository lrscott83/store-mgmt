import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditOrderDetailsModalComponent } from './edit-order-details-modal.component';

describe('EditOrderDetailsModalComponent', () => {
  let component: EditOrderDetailsModalComponent;
  let fixture: ComponentFixture<EditOrderDetailsModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditOrderDetailsModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditOrderDetailsModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
