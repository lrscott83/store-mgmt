// Zero-import leaf module (design D1) — the sentinel token stamped onto
// `UserModel.authToken` for every offline-hydrated session. Consumers (e.g.
// `app-layout.tsx`'s idle lock, Task 11) import ONLY this const, never
// `offline-auth-service`, so an authenticated online page load never
// evaluates crypto/localStorage modules.
export const OFFLINE_SESSION_TOKEN = 'offline-session';
