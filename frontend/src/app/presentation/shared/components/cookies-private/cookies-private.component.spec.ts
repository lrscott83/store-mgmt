import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CookiesPrivateComponent } from './cookies-private.component';

describe('CookiesPrivateComponent', () => {
  let component: CookiesPrivateComponent;
  let fixture: ComponentFixture<CookiesPrivateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CookiesPrivateComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(CookiesPrivateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
