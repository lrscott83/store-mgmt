import { CommonTestModule } from '../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GuestFooterComponent } from './guest-footer.component';

describe('GuestFooterComponent', () => {
  let component: GuestFooterComponent;
  let fixture: ComponentFixture<GuestFooterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuestFooterComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(GuestFooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
