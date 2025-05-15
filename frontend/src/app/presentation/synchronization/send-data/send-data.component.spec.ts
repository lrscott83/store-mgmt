import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SendDataComponent } from './send-data.component';

describe('SendDataComponent', () => {
  let component: SendDataComponent;
  let fixture: ComponentFixture<SendDataComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SendDataComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(SendDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
