import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateOwnerComponent } from './create-owner.component';

describe('CreateOwnerComponent', () => {
  let component: CreateOwnerComponent;
  let fixture: ComponentFixture<CreateOwnerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateOwnerComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CreateOwnerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
