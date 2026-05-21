import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodayEntriesComponent } from './today-entries.component';

describe('TodayEntriesComponent', () => {
  let component: TodayEntriesComponent;
  let fixture: ComponentFixture<TodayEntriesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodayEntriesComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TodayEntriesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
