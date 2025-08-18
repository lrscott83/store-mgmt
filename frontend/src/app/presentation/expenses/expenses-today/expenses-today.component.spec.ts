import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpensesTodayComponent } from './expenses-today.component';

describe('ExpensesTodayComponent', () => {
  let component: ExpensesTodayComponent;
  let fixture: ComponentFixture<ExpensesTodayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpensesTodayComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExpensesTodayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
