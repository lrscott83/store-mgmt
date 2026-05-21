import { CommonTestModule } from '../../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FeaturesHelpDialogComponent } from './features-help-dialog.component';

describe('FeaturesHelpDialogComponent', () => {
  let component: FeaturesHelpDialogComponent;
  let fixture: ComponentFixture<FeaturesHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturesHelpDialogComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FeaturesHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
