import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditSaleCreditModalComponent } from './edit-sale-credit-modal.component';

describe('EditSaleCreditModalComponent', () => {
  let component: EditSaleCreditModalComponent;
  let fixture: ComponentFixture<EditSaleCreditModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditSaleCreditModalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EditSaleCreditModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
