import { CommonTestModule } from '../../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaleCreditsHelpDialogComponent } from './sale-credits-help-dialog.component';

describe('SaleCreditsHelpDialogComponent', () => {
  let component: SaleCreditsHelpDialogComponent;
  let fixture: ComponentFixture<SaleCreditsHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaleCreditsHelpDialogComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SaleCreditsHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
