import { CommonTestModule } from '../../../../testing/common-test.module';

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CsvProductImporterModalComponent } from './csv-product-importer-modal.component';

describe('CsvProductImporterModalComponent', () => {
  let component: CsvProductImporterModalComponent;
  let fixture: ComponentFixture<CsvProductImporterModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CsvProductImporterModalComponent, CommonTestModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CsvProductImporterModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
