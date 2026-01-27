import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { AuthService } from 'src/app/_services/services.index';
import { UserService } from 'src/app/_services/user/user.service';
import { User } from 'src/app/domain/entities/users/user.model';
import { SharedModule } from '../shared/shared.module';

@Component({
    selector: 'app-users',
    imports: [SharedModule, TranslateModule, RouterModule],
    templateUrl: './users.component.html',
    styleUrl: './users.component.scss'
})
export class UsersComponent implements OnInit {

  users$: BehaviorSubject<User[]> = new BehaviorSubject<User[]>([]);

  private subscriptions: Subscription[] = [];

  constructor(private authService: AuthService, private translate: TranslateService, 
    private modalService: NgbModal, private router: Router, private userService: UserService) {
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers() {
    this.userService.getUsers().subscribe(response => {
      if (response && response.succeeded) {
        this.users$.next(response.data);
      }
    });
  }

  openEditUser(user: User) {

  }

  deleteUser(user: User) {
    this.userService.deleteUser(user.id).subscribe(response => {
      if (response && response.succeeded && response.data) {
        user.isActive = false;
      }
    });
  }

  activateUser(user: User) {
    this.userService.activateUser(user.id, true).subscribe(response => {
      if (response && response.succeeded && response.data) {
        user.isActive = true;
      }
    });
  }

  getUserBackgroundColor(user: User) {
    return !user.isActive ? "deactive-user" : "";
  }

  openCreateUserModal() {
    this.router.navigateByUrl("/management/users/create/" + this.authService.currentUserValue.selectedStoreId);
  }

  getTranslation(key: string, param: string = null): Observable<string> {
    return this.translate.get(key, { value: param });
  }
}
