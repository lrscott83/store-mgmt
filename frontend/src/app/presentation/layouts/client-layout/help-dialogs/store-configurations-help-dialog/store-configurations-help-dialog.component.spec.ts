import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StoreConfigurationsHelpDialogComponent } from './store-configurations-help-dialog.component';

describe('StoreConfigurationsHelpDialogComponent', () => {
  let component: StoreConfigurationsHelpDialogComponent;
  let fixture: ComponentFixture<StoreConfigurationsHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StoreConfigurationsHelpDialogComponent]
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
