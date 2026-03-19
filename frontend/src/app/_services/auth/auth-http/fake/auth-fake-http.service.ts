import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { UserModel } from '../../_models/auth-user.model';
import { AuthModel } from '../../_models/auth.model';
import { environment } from '../../../../../environments/environment';

const API_USERS_URL = `${environment.apiUrl}/users`;

// Mock users for testing
const MOCK_USERS: UserModel[] = [];

@Injectable({
  providedIn: 'root'
})
export class AuthFakeHTTPService {
  constructor(private http: HttpClient) {}

  // public methods
  login(email: string, password: string): Observable<any> {
    const notFoundError = new Error('Not Found');
    if (!email || !password) {
      return of(notFoundError);
    }

    const user = MOCK_USERS.find((u) => {
      return u.email?.toLowerCase() === email.toLowerCase() && (u as any).password === password;
    });
    if (!user) {
      return of(notFoundError);
    }

    const auth = new AuthModel();
    auth.authToken = (user as any).authToken || 'fake-token';
    auth.refreshToken = (user as any).refreshToken || 'fake-refresh';
    auth.expiresIn = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    return of(auth);
  }

  createUser(user: UserModel): Observable<any> {
    user.roles = []; // Manager
    user.authToken = 'auth-token-' + Math.random();
    user.refreshToken = 'auth-token-' + Math.random();
    user.expiresIn = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    (user as any).pic = './assets/media/users/default.jpg';

    return this.http.post<UserModel>(API_USERS_URL, user);
  }

  respondeAuthChallenge(user: UserModel): Observable<any> {
    const userChallenge = {
      userName: user.login,
      newPassword: user.password,
      sessionId: (user as any).challenge?.sessionId,
      challengeName: (user as any).challenge?.challengeName
    };
    return this.http.post<UserModel>(API_USERS_URL, userChallenge);
  }

  forgotPassword(email: string): Observable<boolean> {
    const user = MOCK_USERS.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    return of(user !== undefined);
  }

  getUserByToken(token: string): Observable<UserModel> {
    const user = MOCK_USERS.find((u) => {
      return (u as any).authToken === token;
    });

    if (!user) {
      return of(undefined);
    }

    return of(user);
  }

  getAllUsers(): Observable<UserModel[]> {
    return of(MOCK_USERS);
  }

  signInGoogle(): Observable<string> {
    return this.http.get<string>(`${API_USERS_URL}/google_auth_url`);
  }

  getSocialToken(code: string): Observable<AuthModel> {
    return this.http.post<AuthModel>(`${API_USERS_URL}/get_social_token`, {
      code
    });
  }
}
