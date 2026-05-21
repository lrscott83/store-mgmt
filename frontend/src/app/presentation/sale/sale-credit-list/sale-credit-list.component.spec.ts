import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaleCreditListComponent } from './sale-credit-list.component';

describe('SaleCreditListComponent', () => {
  let component: SaleCreditListComponent;
  let fixture: ComponentFixture<SaleCreditListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaleCreditListComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SaleCreditListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
