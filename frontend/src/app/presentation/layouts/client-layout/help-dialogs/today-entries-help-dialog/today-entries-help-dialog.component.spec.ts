import { CommonTestModule } from '../../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TodayEntriesHelpDialogComponent } from './today-entries-help-dialog.component';

describe('TodayEntriesHelpDialogComponent', () => {
  let component: TodayEntriesHelpDialogComponent;
  let fixture: ComponentFixture<TodayEntriesHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TodayEntriesHelpDialogComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TodayEntriesHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
