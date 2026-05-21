import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateResellerComponent } from './create-reseller.component';

describe('CreateResellerComponent', () => {
  let component: CreateResellerComponent;
  let fixture: ComponentFixture<CreateResellerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateResellerComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CreateResellerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
