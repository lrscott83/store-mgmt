import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { MatTabsModule } from '@angular/material/tabs';
import { EditOwnerDetailsComponent } from '../edit-owner-details/edit-owner-details.component';
import { StoreListComponent } from '../../stores/store-list/store-list.component';
import { UserListComponent } from '../../users/user-list/user-list.component';
import { AuthService } from 'src/app/_services/services.index';
import { UserModel } from 'src/app/_services/auth/_models/auth-user.model';

@Component({
    selector: 'app-edit-owner',
    imports: [SharedModule, TranslateModule, EditOwnerComponent, MatTabsModule, EditOwnerDetailsComponent, StoreListComponent, UserListComponent],
    templateUrl: './edit-owner.component.html',
    styleUrl: './edit-owner.component.scss'
})
export class EditOwnerComponent implements OnInit {

  currentUser: UserModel;
  isSuperAdmin: boolean = false;

  constructor(private authService: AuthService) { }

  ngOnInit(): void {
    this.currentUser = this.authService.currentUserValue;
    this.isSuperAdmin = this.currentUser.isSuperAdmin;
  }

  openCreateOwnerModal() {
    
  }
}
