import { CommonTestModule } from '../../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PrivatePoliceComponent } from './private-police.component';

describe('PrivatePoliceComponent', () => {
  let component: PrivatePoliceComponent;
  let fixture: ComponentFixture<PrivatePoliceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrivatePoliceComponent, CommonTestModule]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(PrivatePoliceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
