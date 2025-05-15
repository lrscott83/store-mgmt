import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditResellerDetailsComponent } from './edit-reseller-details.component';

describe('EditResellerDetailsComponent', () => {
  let component: EditResellerDetailsComponent;
  let fixture: ComponentFixture<EditResellerDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditResellerDetailsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(EditResellerDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
