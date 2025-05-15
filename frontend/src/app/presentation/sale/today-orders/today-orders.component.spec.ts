import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodayOrdersComponent } from './today-orders.component';

describe('TodayOrdersComponent', () => {
  let component: TodayOrdersComponent;
  let fixture: ComponentFixture<TodayOrdersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodayOrdersComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TodayOrdersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
