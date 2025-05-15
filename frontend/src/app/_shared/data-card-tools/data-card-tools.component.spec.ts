import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataCardToolsComponent } from './data-card-tools.component';

describe('DataCardToolsComponent', () => {
  let component: DataCardToolsComponent;
  let fixture: ComponentFixture<DataCardToolsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DataCardToolsComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(DataCardToolsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
