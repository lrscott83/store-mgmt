import { Component, HostListener } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, Subscription, catchError } from 'rxjs';
import { BaseState } from 'src/app/_services/_models/base-state.model';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { OwnerService } from 'src/app/_services/owner/owner.service';
import { AuthService } from 'src/app/_services/services.index';
import { StoreService } from 'src/app/_services/store/store.service';
import { CanDeactivateType } from 'src/app/_shared/guards/can-deactivate.guard';
import { Owner } from 'src/app/domain/entities/owners/owner.model';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { EditOwnerComponent } from '../../owners/edit-owner/edit-owner.component';
import { ModuleService } from 'src/app/_services/module/module.service';
import { Module } from 'src/app/domain/entities/modules/module.model';
import { AuthorizationService } from 'src/app/_services/authorization/authorization.service';
import { StoreModuleStateService } from 'src/app/_services/shared/store-module-state.service';

@Component({
    selector: 'app-edit-store',
    imports: [SharedModule, TranslateModule, RouterModule],
    templateUrl: './edit-store.component.html',
    styleUrl: './edit-store.component.scss',
    providers: []
})
export class EditStoreComponent {

  editStoreId: string;
  currentUser: UserModel;
  isOwnerAdmin: boolean = false;
  isSuperAdmin: boolean = false;
  private subscriptions: Subscription[] = [];
  formGroup: FormGroup;

  baseState: BaseState;
  ownersDataSource: Observable<Owner[]>;

  $modules: BehaviorSubject<Module[]> = new BehaviorSubject<Module[]>([]);
  totalPrice: number = 0;
  //selectedModuleIds: Set<number> = new Set<number>();


  constructor(private formBuilder: FormBuilder, private storeService: StoreService,
    private authService: AuthService, private router: Router, private ownerService: OwnerService,
    private route: ActivatedRoute, private moduleService: ModuleService, private authorizationService: AuthorizationService,
    private storeModuleStateService: StoreModuleStateService) { }

  ngOnInit(): void {
    this.currentUser = this.authService.currentUserValue;
    this.isSuperAdmin = this.currentUser.isSuperAdmin;
    this.isOwnerAdmin = this.isSuperAdmin || this.authorizationService.hasOwnersAvailableFeature();
    this.editStoreId = this.route.snapshot.params['id'] || this.currentUser.selectedStoreId;
    this.loadForm();
    this.getModulesToStore();
    if (this.isOwnerAdmin)
      this.getOwners();
    if (this.editStoreId)
      this.getStoreById(this.editStoreId);
  }

  getHeader(): string {
    return !this.editStoreId ? 'STORE.CREATE' : 'STORE.EDIT'
  }

  getOwners() {
    this.baseState = this.ownerService.baseState;
    this.ownerService.fetch();
    this.ownersDataSource = this.ownerService.items$;
  }

  getModulesToStore() {
    this.moduleService.getModulesToStore()
      .pipe(catchError((error) => {
        // return of({
        //   data: null,
        //   succeeded: false,
        //   message: "",
        //   actionCode: 400,
        //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
        // });
        console.error("Error loading modules to store.", error);
        throw error;
      }))
      .subscribe(response => {
        if (response && response.succeeded) {
          this.displayModules(response.data);
        } else {
          console.error("Error loading modules to store ...");
        }
      });
  }

  private displayModules(modules: Module[]) {
    modules
      .filter(module => module.priceIncluded)
      .forEach(module => {
        //this.selectedModuleIds.add(module.id);
        module.selected = true;
      });
    this.$modules.next(modules);
  }

  getTotalCurrentPrice(): number {
    return this.$modules.value
      .filter(module => module.selected)
      .reduce((acc, module) => acc + module.currentPrice, 0);
  }

  getTotalPrice(): number {
    return this.$modules.value
      .filter(module => module.selected)
      .reduce((acc, module) => acc + module.price, 0);
  }

  selectAllModules(selected) {
    this.$modules.value.forEach(module => {
      if (!module.priceIncluded)
        module.selected = selected;
    });
    this.$modules.next(this.$modules.value);
  }

  selectModule(selected: boolean, id: number) {
    const module: Module = this.$modules.value.find(module => module.id === id);
    module.selected = selected;
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sb) => sb.unsubscribe());
  }

  // @HostListener allows us to also guard against browser refresh, close, etc.
  //@HostListener('window:beforeunload')
  canDeactivate(): CanDeactivateType {
    return this.formGroup.pristine;
  }

  getStoreById(storeId: string) {
    this.storeService.getStoreById(storeId)
      .pipe(catchError((error) => {
        // return of({
        //   data: null,
        //   succeeded: false,
        //   message: "",
        //   actionCode: 400,
        //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
        // });
        console.error("Error loading store by id: ", error);
        throw error;
      }))
      .subscribe(response => {
        if (response && response.succeeded && response.data) {
          this.formGroup.patchValue(response.data);
          this.$modules.value.forEach(module => {
            const storeModule: Module = response.data.modules.find(m => module.id === m.id);
            if (storeModule) {
              module.selected = true;
              module.price = storeModule.price;
              module.currentPrice = storeModule.currentPrice;
              module.discountText = storeModule.discountText;
            }
          });
          this.$modules.next(this.$modules.value);
        } else {
          console.error("Error loading store by id ...");
        }
      });
  }

  onSubmit(): void {
    if (!this.formGroup.valid) {
      this.formGroup.markAllAsTouched();
    } else {
      const approved: boolean = this.isOwnerAdmin ? this.formGroup.value.approved : false;
      if (!this.editStoreId) {
        const ownerId: string = this.isOwnerAdmin ? this.formGroup.value.ownerId : this.currentUser.id;
        this.storeService.createStore(ownerId, this.formGroup.value.name, this.formGroup.value.address,
          this.formGroup.value.description, approved, Array.from(this.$modules.value.filter(m => m.selected).map(m => m.id)))
          .pipe(catchError((error) => {
            // return of({
            //   data: null,
            //   succeeded: false,
            //   message: "",
            //   actionCode: 400,
            //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
            // });
            console.error("Error creating store: ", error);
            throw error;
          }))
          .subscribe(response => {
            if (response && response.succeeded && response.data) {
              this.formGroup.reset();
              this.router.navigateByUrl('/management/users/create/');
            }
            else
              console.error("Error creating store ...");
          });
      } else {
        this.storeService.editStore(this.editStoreId, this.formGroup.value.name, this.formGroup.value.address,
          this.formGroup.value.description, approved, this.formGroup.value.paymentStartDate, this.formGroup.value.isActive,
          Array.from(this.$modules.value.filter(m => m.selected).map(m => m.id)))
          .pipe(catchError((error) => {
            // return of({
            //   data: null,
            //   succeeded: false,
            //   message: "",
            //   actionCode: 400,
            //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
            // });
            console.error("Error editing store: ", error);
            throw error;
          }))
          .subscribe(response => {
            if (response && response.succeeded && response.data) {
              // if (this.currentUser.isSuperAdmin) {
              //   this.formGroup.reset();
              //   this.router.navigateByUrl('/management/stores');
              // } else {
                this.authService.getUserByToken().subscribe(user => {
                  document.location.reload();
                  this.storeModuleStateService.modulesUpdated(true);
                });
              // }
            }
            else
              console.error("Error updating store ...");
          });
      }
    }
  }

  loadForm() {
    this.formGroup = this.formBuilder.group({
      name: [{ value: "", disabled: false }, Validators.compose([Validators.required])],
      address: [{ value: "", disabled: false }, Validators.compose([])],
    });
    if (this.isOwnerAdmin) {
      this.formGroup.addControl('ownerId', new FormControl("", Validators.required));
      this.formGroup.addControl('approved', new FormControl(false, []));
      this.formGroup.addControl('description', new FormControl("", []));
    }
    if (this.isSuperAdmin && this.editStoreId) {
      this.formGroup.addControl('paymentStartDate', new FormControl("", Validators.required));
    }
    if (this.isSuperAdmin) {
      this.formGroup.addControl('isActive', new FormControl(false, []));
    }
  }

  // helpers for View
  isControlInvalid(controlName: string, validator: string): boolean {
    const control = this.formGroup.controls[controlName];
    if (validator == "") {
      return control.hasError('required') && (control.dirty || control.touched);
    } else {
      return control.hasError(validator) && (control.dirty || control.touched);
    }
  }

}
