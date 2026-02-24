import { Component, OnInit } from '@angular/core';
import { AuthService } from 'src/app/_services/services.index';
import { User } from 'src/app/domain/entities/users/user.model';
import { SharedModule } from '../../shared/shared.module';
import { TranslateModule } from '@ngx-translate/core';
import { EditUserDetailsComponent } from '../edit-user-details/edit-user-details.component';
import { ActivatedRoute } from '@angular/router';
import { UserService } from 'src/app/_services/user/user.service';
import { BehaviorSubject, catchError } from 'rxjs';

@Component({
    selector: 'app-edit-user',
    imports: [SharedModule, TranslateModule, EditUserDetailsComponent],
    templateUrl: './edit-user.component.html',
    styleUrl: './edit-user.component.scss'
})
export class EditUserComponent implements OnInit {

  userId: string;
  user$: BehaviorSubject<User> = new BehaviorSubject<User>(undefined);
  currentUser: User;

  constructor(private authService: AuthService, private route: ActivatedRoute, private userService: UserService) {

  }

  getReturnEditProfileUser(): string {
    return "/management/users";
  }

  ngOnInit(): void {
    this.userId = this.route.snapshot.params['id'];
    this.currentUser = this.authService.currentUserValue;
    if (this.userId && this.userId !== "") {
      this.getUserById(this.userId);
    } else {
      this.user$.next(this.currentUser);
    }
  }

  getUserById(userId: string) {
    this.userService.getUserById(userId)
      .pipe(catchError((error) => {
        // return of({
        //   data: null,
        //   succeeded: false,
        //   message: "",
        //   actionCode: 400,
        //   errors: [this.translateService.instant('REGISTRATION.UNEXPECTED_ERROR')],
        // });
        throw error;
      }))
      .subscribe(response => {
        if (response && response.succeeded && response.data) {
          this.user$.next(response.data);
        }
      });
  }
}


