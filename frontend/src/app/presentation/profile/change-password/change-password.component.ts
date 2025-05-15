import { Component, OnInit } from '@angular/core';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from 'src/app/_services/services.index';
import { User } from 'src/app/domain/entities/users/user.model';
import { EditUserCredentialsComponent } from '../../users/edit-user-credentials/edit-user-credentials.component';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [SharedModule, TranslateModule, EditUserCredentialsComponent],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss'
})
export class ChangePasswordComponent implements OnInit {
  currentUserId: string;

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
    this.currentUserId = this.authService.currentUserValue.id;
  }
}
