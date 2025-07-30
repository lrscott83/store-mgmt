import { Component, Input, OnInit } from '@angular/core';
import { MatMenuModule } from '@angular/material/menu';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, catchError } from 'rxjs';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';
import { AuthService } from 'src/app/_services/services.index';
import { StoreService } from 'src/app/_services/store/store.service';
import { Store } from 'src/app/domain/entities/stores/store.model';
import Swal from 'sweetalert2';
import { SharedModule } from '../../shared/shared.module';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-store-list',
  standalone: true,
  imports: [SharedModule, TranslateModule, RouterModule, MatMenuModule, MatIconModule],
  templateUrl: './store-list.component.html',
  styleUrl: './store-list.component.scss'
})
export class StoreListComponent implements OnInit {
  
  stores$: BehaviorSubject<Store[]> = new BehaviorSubject<Store[]>([]);

  currentUser: UserModel;
  isSuperAdmin: boolean = false;

  constructor(private authService: AuthService, private translate: TranslateService, private storeService: StoreService) {

  }

  ngOnInit(): void {
    this.currentUser = this.authService.currentUserValue;
    this.isSuperAdmin = this.currentUser.isSuperAdmin;
    this.loadStores();
  }

  loadStores() {
    this.storeService.getStoresByCurrentUser()
    .pipe(catchError((error) => {
      // return of({
      //   data: null,
      //   succeeded: false,
      //   message: "",
      //   actionCode: 400,
      //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
      // });
      console.error("Error loading all stores: ", error);
      throw error;
    }))
    .subscribe(response => {
      if (response && response.data) {
        this.stores$.next(response.data);
      }
      else {
        console.error("Error loading all stores ...");
      }
    });
  }

  onDeactivate(store: Store) {
    Swal.fire({
      title: this.translate.instant('GENERAL.DEACTIVATE_CONFIRM_TITLE'),
      text: this.translate.instant('GENERAL.DEACTIVATE_CONFIRM_MESSAGE',
        { name: this.translate.instant('STORE.CONFIRM_TEXT') }),
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3456ff",
      cancelButtonColor: "#dc3545",
      confirmButtonText: this.translate.instant('GENERAL.YES'),
      cancelButtonText: this.translate.instant('GENERAL.NO'),
    }).then((result) => {
      if (result.isConfirmed) {
        this.storeService.delete(store.id)
        .pipe(catchError((error) => {
          // return of({
          //   data: null,
          //   succeeded: false,
          //   message: "",
          //   actionCode: 400,
          //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
          // });
          console.error("Error deactivating store: ", error);
          throw error;
        }))
        .subscribe(response => {
          if (response.data) {
            this.loadStores();
          }
          else
            console.log("Error deactivating store with id: " + store.id);
        });
      }
    });
  }

  onActivate(store: Store) {
    Swal.fire({
      title: this.translate.instant('GENERAL.ACTIVATE_CONFIRM_TITLE'),
      text: this.translate.instant('GENERAL.ACTIVATE_CONFIRM_MESSAGE',
        { name: this.translate.instant('STORE.TEXT') }),
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3456ff",
      cancelButtonColor: "#dc3545",
      confirmButtonText: this.translate.instant('GENERAL.YES'),
      cancelButtonText: this.translate.instant('GENERAL.NO'),
    }).then((result) => {
      if (result.isConfirmed) {
        this.storeService.activateStore(store.id)
        .pipe(catchError((error) => {
          // return of({
          //   data: null,
          //   succeeded: false,
          //   message: "",
          //   actionCode: 400,
          //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
          // });
          console.error("Error activating store: ", error);
          throw error;
        }))
        .subscribe(response => {
          if (response.data) {
            this.loadStores();
          }
          else
            console.log("Error activating store with id: " + store.id);
        });
      }
    });
  }

  onApproved(store: Store) {
    Swal.fire({
      title: this.translate.instant('GENERAL.APPROVE_CONFIRM_TITLE'),
      text: this.translate.instant('GENERAL.APPROVE_CONFIRM_MESSAGE',
        { name: this.translate.instant('STORE.CONFIRM_TEXT') }),
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3456ff",
      cancelButtonColor: "#dc3545",
      confirmButtonText: this.translate.instant('GENERAL.YES'),
      cancelButtonText: this.translate.instant('GENERAL.NO'),
    }).then((result) => {
      if (result.isConfirmed) {
        this.storeService.approveStore(store.id)
        .pipe(catchError((error) => {
          // return of({
          //   data: null,
          //   succeeded: false,
          //   message: "",
          //   actionCode: 400,
          //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
          // });
          console.error("Error approving store: ", error);
          throw error;
        }))
        .subscribe(response => {
          if (response.data) {
            store.approved = true;

          }
          else
            console.log("Error approving store with id: " + store.id);
        });
      }
    });
  }

  onDisapproved(store: Store) {
    Swal.fire({
      title: this.translate.instant('GENERAL.DISAPPROVE_CONFIRM_TITLE'),
      text: this.translate.instant('GENERAL.DISAPPROVE_CONFIRM_MESSAGE',
        { name: this.translate.instant('STORE.CONFIRM_TEXT') }),
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#3456ff",
      cancelButtonColor: "#dc3545",
      confirmButtonText: this.translate.instant('GENERAL.YES'),
      cancelButtonText: this.translate.instant('GENERAL.NO'),
    }).then((result) => {
      if (result.isConfirmed) {
        this.storeService.disapproveStore(store.id)
        .pipe(catchError((error) => {
          // return of({
          //   data: null,
          //   succeeded: false,
          //   message: "",
          //   actionCode: 400,
          //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
          // });
          console.error("Error disapproving store: ", error);
          throw error;
        }))
        .subscribe(response => {
          if (response.data) {
            this.loadStores();
          }
          else
            console.log("Error disapproving store with id: " + store.id);
        });
      }
    });
  }

  getStoreBackgroundColor(store: Store) {
    return !store.isActive 
    ? "deactive-store" 
    : !store.approved ? "disapproved-store" : "";
  }

}
