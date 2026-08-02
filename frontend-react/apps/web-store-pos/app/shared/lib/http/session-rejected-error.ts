/**
 * The server answered, and its answer was that this session is over.
 *
 * Distinct from a transport failure on purpose. `AuthController.GetMeAsync`
 * wraps the handler result in an unconditional `Ok(...)`, so `GetMeQuery`'s
 * failure paths — including the one that blacklists a deactivated user's token
 * — arrive as HTTP 200 with `succeeded: false` and `data: null`. A caller that
 * treats every `getMe` failure as "the network is down" keeps such a user
 * signed in.
 *
 * Lives in its own module rather than beside `authHttpService` so that a test
 * mocking the http service does not have to know this class exists. Vitest
 * THROWS on a named export missing from a mock factory, and `auth-store`
 * imports the service dynamically inside a try — so a missing export there is
 * swallowed as if it were a network error, and the user silently loses the
 * fields the caller needed. That failure is invisible; this file is the fix.
 */
export class SessionRejectedError extends Error {
  readonly name = 'SessionRejectedError';
  constructor(message = 'The server rejected this session') {
    super(message);
    Object.setPrototypeOf(this, SessionRejectedError.prototype);
  }
}
