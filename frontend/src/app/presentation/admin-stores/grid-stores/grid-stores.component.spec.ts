import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GridStoresComponent } from './grid-stores.component';

describe('GridStoresComponent', () => {
  let component: GridStoresComponent;
  let fixture: ComponentFixture<GridStoresComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GridStoresComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(GridStoresComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
