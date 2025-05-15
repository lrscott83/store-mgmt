import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DownloadHelpDialogComponent } from './download-help-dialog.component';

describe('DownloadHelpDialogComponent', () => {
  let component: DownloadHelpDialogComponent;
  let fixture: ComponentFixture<DownloadHelpDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DownloadHelpDialogComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(DownloadHelpDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
