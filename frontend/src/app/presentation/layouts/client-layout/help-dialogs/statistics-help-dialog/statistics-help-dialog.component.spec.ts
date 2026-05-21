import { CommonTestModule } from '../../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatisticsHelpDialogComponent } from './statistics-help-dialog.component';

describe('StatisticsHelpDialogComponent', () => {
  let component: StatisticsHelpDialogComponent;
  let fixture: ComponentFixture<StatisticsHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatisticsHelpDialogComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StatisticsHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
