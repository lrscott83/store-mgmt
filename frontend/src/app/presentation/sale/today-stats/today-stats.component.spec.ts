import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodayStatsComponent } from './today-stats.component';

describe('TodayStatsComponent', () => {
  let component: TodayStatsComponent;
  let fixture: ComponentFixture<TodayStatsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodayStatsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(TodayStatsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
