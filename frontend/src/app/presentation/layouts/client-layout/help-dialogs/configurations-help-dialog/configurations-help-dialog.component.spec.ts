import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfigurationsHelpDialogComponent } from './configurations-help-dialog.component';

describe('ConfigurationsHelpDialogComponent', () => {
  let component: ConfigurationsHelpDialogComponent;
  let fixture: ComponentFixture<ConfigurationsHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfigurationsHelpDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(ConfigurationsHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
