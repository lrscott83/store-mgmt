import { TestBed } from '@angular/core/testing';
import { HttpClient, HTTP_INTERCEPTORS } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { ErrorInterceptor } from './error-interceptor.service';
import { AuthService } from '../_services/auth/auth.service';

describe('ErrorInterceptor', () => {
  let httpMock: HttpTestingController;
  let httpClient: HttpClient;
  let authService: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        ErrorInterceptor,
        { provide: Router, useValue: { navigateByUrl: () => Promise.resolve(true) } },
        {
          provide: HTTP_INTERCEPTORS,
          useClass: ErrorInterceptor,
          multi: true
        }
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
    httpClient = TestBed.inject(HttpClient);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('Error Handling - Only 401 should call logout', () => {
    /**
     * 401 Unauthorized: User's credentials are invalid/expired
     * SHOULD call logout - user needs to re-authenticate
     */
    it('SHOULD call logout on 401 Unauthorized', (done) => {
      spyOn(authService, 'logout');

      httpClient.get('/api/test').subscribe({
        error: (err) => {
          expect(err.status).toBe(401);
          expect(authService.logout).toHaveBeenCalled();
          done();
        }
      });

      const req = httpMock.expectOne('/api/test');
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });
    });

    /**
     * 403 Forbidden: User IS authenticated but:
     * - Doesn't have permission for this resource
     * - OR backend is unavailable (e.g., usage tracker when offline)
     * Should NOT call logout - user stays logged in
     */
    it('should NOT call logout on 403 Forbidden', (done) => {
      spyOn(authService, 'logout');

      httpClient.get('/api/test').subscribe({
        error: (err) => {
          expect(err.status).toBe(403);
          expect(authService.logout).not.toHaveBeenCalled();
          done();
        }
      });

      const req = httpMock.expectOne('/api/test');
      req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });
    });

    /**
     * 404 Not Found: Resource doesn't exist
     * Should NOT call logout - not an auth issue
     */
    it('should NOT call logout on 404 Not Found', (done) => {
      spyOn(authService, 'logout');

      httpClient.get('/api/test').subscribe({
        error: (err) => {
          expect(err.status).toBe(404);
          expect(authService.logout).not.toHaveBeenCalled();
          done();
        }
      });

      const req = httpMock.expectOne('/api/test');
      req.flush('Not Found', { status: 404, statusText: 'Not Found' });
    });

    /**
     * 500 Internal Server Error: Server error
     * Should NOT call logout - not an auth issue
     */
    it('should NOT call logout on 500 Internal Server Error', (done) => {
      spyOn(authService, 'logout');

      httpClient.get('/api/test').subscribe({
        error: (err) => {
          expect(err.status).toBe(500);
          expect(authService.logout).not.toHaveBeenCalled();
          done();
        }
      });

      const req = httpMock.expectOne('/api/test');
      req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
    });

    /**
     * 503 Service Unavailable: Backend is down/temporarily unavailable
     * Should NOT call logout - user stays logged in for offline mode
     */
    it('should NOT call logout on 503 Service Unavailable', (done) => {
      spyOn(authService, 'logout');

      httpClient.get('/api/test').subscribe({
        error: (err) => {
          expect(err.status).toBe(503);
          expect(authService.logout).not.toHaveBeenCalled();
          done();
        }
      });

      const req = httpMock.expectOne('/api/test');
      req.flush('Service Unavailable', { status: 503, statusText: 'Service Unavailable' });
    });

    /**
     * Network error (status 0): No internet connection
     * Should NOT call logout - user stays logged in for offline mode
     */
    it('should NOT call logout on network error (status 0)', (done) => {
      spyOn(authService, 'logout');

      httpClient.get('/api/test').subscribe({
        error: () => {
          // Network error - no status
          expect(authService.logout).not.toHaveBeenCalled();
          done();
        }
      });

      const req = httpMock.expectOne('/api/test');
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Network Error' });
    });
  });
});
