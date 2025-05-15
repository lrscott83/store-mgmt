import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateStoreUserComponent } from './create-store-user.component';

describe('CreateStoreUserComponent', () => {
  let component: CreateStoreUserComponent;
  let fixture: ComponentFixture<CreateStoreUserComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateStoreUserComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CreateStoreUserComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
