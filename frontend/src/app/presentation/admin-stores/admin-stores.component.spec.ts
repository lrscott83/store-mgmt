import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminStoresComponent } from './admin-stores.component';

describe('AdminStoresComponent', () => {
  let component: AdminStoresComponent;
  let fixture: ComponentFixture<AdminStoresComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminStoresComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AdminStoresComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
