import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EgressComponent } from './egress.component';

describe('EgressComponent', () => {
  let component: EgressComponent;
  let fixture: ComponentFixture<EgressComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EgressComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EgressComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
