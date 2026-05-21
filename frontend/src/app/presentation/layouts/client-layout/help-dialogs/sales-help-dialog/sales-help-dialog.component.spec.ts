import { CommonTestModule } from '../../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SalesHelpDialogComponent } from './sales-help-dialog.component';

describe('SalesHelpDialogComponent', () => {
  let component: SalesHelpDialogComponent;
  let fixture: ComponentFixture<SalesHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalesHelpDialogComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SalesHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
