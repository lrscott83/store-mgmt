import { Component, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { TranslationModule } from 'src/app/_modules/i18n/translation.module';
import { ProductRepository } from 'src/app/application/products/product.repository';
import Swal from 'sweetalert2';
import { SharedModule } from '../../shared/shared.module';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DataSerializerService } from 'src/app/application/synchronization/data-serializer.service';

@Component({
    selector: 'app-send-data',
    imports: [TranslationModule, SharedModule],
    templateUrl: './send-data.component.html',
    styleUrl: './send-data.component.scss'
})
export class SendDataComponent implements OnInit{

  showPassword: boolean = false;
  formGroup: FormGroup;

  constructor(private productRepository: ProductRepository, private translate: TranslateService, private formBuilder: FormBuilder, private serializerService: DataSerializerService) {

  }

  ngOnInit(): void {
    this.loadForm();
  }

  async exportData() {
    if (!this.formGroup.valid) {
      this.formGroup.markAllAsTouched();
      return;
    }
    await this.serializerService.serializeEncryptedZip(this.formGroup.value.password);
  }

  async shareData() {
    if (!this.formGroup.valid) {
      this.formGroup.markAllAsTouched();
      return;
    }
    const productsJson = this.productRepository.getProductsJson();
    const blob = new Blob([productsJson], { type: 'application/json' });

    if (!navigator.share) {
      //alert('Tu navegador no soporta esta función');
      const url = URL.createObjectURL(blob);
      const mensaje = encodeURIComponent('Archivo JSON adjunto:');
      const enlaceWhatsApp = `https://wa.me/?text=${mensaje}%20${encodeURIComponent(url)}`;
      window.open(enlaceWhatsApp, '_blank'); // [[2]][[7]]
    } else {
      try {
        const archivo = new File([blob], 'datos.json', { type: 'application/json' });
        await navigator.share({
          files: [archivo], // El File creado previamente [[7]]
          title: 'Compartir JSON',
          text: 'Archivo JSON generado desde la app'
        });
      } catch (error) {
        Swal.fire({
                    icon: "error",
                    title: this.translate.instant('GENERAL.RESPONSE.ERROR_TITLE'),
                    text: this.translate.instant('AUTH.LOGIN.OFFLINE_MESSAGE'),
                  });
        console.error('Error al compartir:', error);
      }
    }
  }

  loadForm() {
      this.formGroup = this.formBuilder.group({
        password: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
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
