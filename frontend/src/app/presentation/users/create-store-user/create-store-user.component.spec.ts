import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

import { CreateStoreUserComponent } from './create-store-user.component';

describe('CreateStoreUserComponent', () => {
  let component: CreateStoreUserComponent;
  let fixture: ComponentFixture<CreateStoreUserComponent>;

  const mockActivatedRoute = {
    snapshot: { params: { storeId: 'test-store-id' } }
  };

  const mockRouter = {
    navigateByUrl: jasmine.createSpy('navigateByUrl')
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateStoreUserComponent, CommonTestModule],
      providers: [
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CreateStoreUserComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
