import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';
import { DataSerializerService } from 'src/app/application/synchronization/data-serializer.service';
import { DataFile } from 'src/app/application/synchronization/data.file.model';
import Swal from 'sweetalert2';
import { SharedModule } from '../../shared/shared.module';
import { TranslationModule } from 'src/app/_modules/i18n/translation.module';
import { DataSynchronizerService } from 'src/app/application/synchronization/data-synchronizer.service';
import { Result } from 'src/app/domain/commons/result';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-receive-data',
  standalone: true,
  imports: [TranslationModule, SharedModule],
  templateUrl: './receive-data.component.html',
  styleUrl: './receive-data.component.scss'
})
export class ReceiveDataComponent {
  showPassword: boolean = false;
  formGroup: FormGroup;

  fileToUpload: File;
  dataPath: string = null;

  constructor(private translate: TranslateService, private formBuilder: FormBuilder, private serializerService: DataSerializerService, private synchronizerService: DataSynchronizerService, private toastrService: ToastrService) {

  }

  ngOnInit(): void {
    this.loadForm();
  }

  async exportData() {
    if (!this.formGroup.valid) {
      this.formGroup.markAllAsTouched();
      return;
    }
    const files: DataFile[] = await this.serializerService.deserializeEncryptedZip(this.fileToUpload, this.formGroup.value.password);
    if (files.length !== 0) {
      const result: Result = await this.synchronizerService.synchronizeFiles(files);
      if (result.succeeded) {
        this.toastrService.success(this.translate.instant('SYNCHRONIZATION.RECEIVE_IMPORT_SUCCESS'))
      } else {
        const message: string = result.errors.length > 0
          ? result.errors[0].description
          : this.translate.instant('SYNCHRONIZATION.RECEIVE_IMPORT_ERROR');
        Swal.fire({
          icon: "error",
          title: this.translate.instant('GENERAL.RESPONSE.ERROR_TITLE'),
          text: message,
        });
      }
    } else {
      Swal.fire({
        icon: "error",
        title: this.translate.instant('GENERAL.RESPONSE.ERROR_TITLE'),
        text: this.translate.instant('SYNCHRONIZATION.RECEIVE_IMPORT_ERROR'),
      });
    }
  }

  selectFile = (files) => {
    if (files.length === 0) {
      return;
    }
    this.fileToUpload = <File>files[0];
    this.formGroup.patchValue({ dataPath: this.fileToUpload.name });
  }

  loadForm() {
    this.formGroup = this.formBuilder.group({
      password: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      dataPath: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
    });
  }

  onShowPassword(event: MouseEvent) {
    this.showPassword = !this.showPassword;
    event.stopPropagation();
  }

  isControlInvalid(controlName: string, validator: string): boolean {
    const control = this.formGroup.controls[controlName];
    if (validator === "passwordMatch") {
      var pass = this.formGroup.get('password');
      if (control.value && pass.value !== control.value) {
        control.setErrors({});
        return true;
      }
      if (control.value) {
        control.setErrors(null);
      }
      return false;
    }
    else {
      return control.hasError(validator) && (control.dirty || control.touched);
    }
  }
}
