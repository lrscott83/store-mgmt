import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { User } from 'src/app/domain/entities/users/user.model';
import { AuthService } from 'src/app/_services/services.index';
import { EditUserDetailsComponent } from '../../users/edit-user-details/edit-user-details.component';

@Component({
    selector: 'app-edit-profile',
    imports: [SharedModule, TranslateModule, EditUserDetailsComponent],
    templateUrl: './edit-profile.component.html',
    styleUrl: './edit-profile.component.scss'
})
export class EditProfileComponent implements OnInit {
  currentUser: User;

  constructor(private authService: AuthService) {

  }

  getReturnEditProfileUser(): string {
    return this.authService.getCurrentUserDefaultUrl();
  }

  // // @HostListener allows us to also guard against browser refresh, close, etc.
  // //@HostListener('window:beforeunload')
  // canDeactivate(): CanDeactivateType {
  //   return this.formGroup.pristine;
  // }

  // savePendingChanges(): Promise<boolean> {
  //   return this.onSubmit();
  // }

  ngOnInit(): void {
    this.currentUser = this.authService.currentUserValue;
  }

  
}
