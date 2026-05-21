import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaleCreditsComponent } from './sale-credits.component';

describe('SaleCreditsComponent', () => {
  let component: SaleCreditsComponent;
  let fixture: ComponentFixture<SaleCreditsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaleCreditsComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SaleCreditsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
