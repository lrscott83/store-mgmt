import { CommonTestModule } from '../../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StoreConfigurationsHelpDialogComponent } from './store-configurations-help-dialog.component';

describe('StoreConfigurationsHelpDialogComponent', () => {
  let component: StoreConfigurationsHelpDialogComponent;
  let fixture: ComponentFixture<StoreConfigurationsHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StoreConfigurationsHelpDialogComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StoreConfigurationsHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
