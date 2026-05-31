# Design: phase4-profile (User Profile + Change Password)

## Technical Approach

Approach A from the proposal. A new `app/profile/` slice with two route containers
(`edit-profile`, `change-password`) following the `sync/export.tsx` precedent:
route module exports a named `XxxPage` + `default`, plus a module-scope
`featureLoader` loader. Presentational forms receive callbacks (`onSubmit`); the
container owns side effects (HTTP call, store update, navigation). HTTP is isolated in
a `profileHttpService` object literal (mirrors `authHttpService`). The store stays the
single source of truth via a new `auth-store.updateUser()`. Connectivity gating is a
reusable `useOnlineStatus()` hook. Online-only: no offline write path.

## Architecture Decisions

| Decision | Options | Choice + Rationale |
|----------|---------|--------------------|
| Profile edit: optimistic vs await-then-update | (a) optimistic store write then rollback on error; (b) await PUT, then `updateUser()` | **(b) await-then-update.** Backend is authority and may normalize fields; navbar must never show a name the server rejected. Rollback adds complexity for no UX gain on a single-form submit. |
| Where logout+redirect lives (password change) | (a) inside `profileHttpService`; (b) inside the container after success | **(b) container.** Service stays a pure transport. Navigation/store are side effects the container owns — consistent with the team's container/presentational split and `navbar.handleLogout`. |
| Service shape | (a) class with `new`; (b) module-scope object literal | **(b) object literal singleton.** Matches `authHttpService` exactly; no per-call state to hold. |
| `featureLoader` storeId source | (a) `params.storeId`; (b) `getState().user?.selectedStoreId` | **(b).** Profile routes have no `:storeId` param; passing it at module scope avoids a false StoreUser-unauthorized redirect. |
| `updateUser()` payload | (a) accept partial patch; (b) accept full `UserModel` | **(b) full UserModel.** Mirrors `setUser()` dual-key write; container builds `{ ...user, ...changes, password: '' }` and preserves `expiresIn`/token. |

## Data Flow

    EditProfileForm ──onSubmit(payload)──▶ edit-profile.tsx (container)
                                              │  profileHttpService.updateProfile(id, payload)
                                              ▼            │ PUT /v1/users/{id}
                                        auth-store.updateUser(updatedUser)
                                              │  (Zustand + AUTH_MODEL + CURRENT_USER)
                                              ▼
                                          Navbar re-renders new fullName

    ChangePasswordForm ──validate(regex+match)──▶ onSubmit ──▶ change-password.tsx
                                              │  profileHttpService.changePassword(id, {old,new})
                                              ▼            │ POST /v1/users/change-password/{id}
                                        auth-store.logout() ─▶ navigate('/login')

Both containers read `useOnlineStatus()`; `false` disables submit + renders inline notice.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/profile/routes/edit-profile.tsx` | Create | Container: loader, prefill from store, calls service + `updateUser()`, success/error feedback. |
| `app/profile/routes/change-password.tsx` | Create | Container: loader, calls service, on success `logout()`+`navigate('/login')`. |
| `app/profile/components/edit-profile-form.tsx` | Create | Presentational. Fields fullName(req)/cellPhone/email. `onSubmit`, `isOnline`, `busy`, `error`. |
| `app/profile/components/change-password-form.tsx` | Create | Presentational. old/new/confirm. Client regex + match validation, inline messages. |
| `app/profile/lib/services/profile-http-service.ts` | Create | `updateProfile`, `changePassword`. Uses shared `apiClient`. |
| `app/shared/lib/hooks/use-online-status.ts` | Create | `useOnlineStatus(): boolean`. window online/offline listeners + cleanup. |
| `app/profile/routes/__tests__/profile-routes.test.tsx` | Create | Smoke tests for both containers. |
| `app/routes.ts` | Modify | Add `route('profile/edit', ...)` + `route('profile/change-password', ...)` in app-layout. |
| `app/shared/components/navbar.tsx` | Modify | Two dropdown `Link`s; close menu on click. |
| `app/shared/lib/i18n/es.ts` | Modify | Add `PROFILE.*` keys. |
| `app/shared/lib/stores/auth-store.ts` | Modify | Add `updateUser(user: UserModel)` to interface + impl. |

## Interfaces / Contracts

```ts
// profile-http-service.ts
export const profileHttpService = {
  updateProfile(userId: string,
    p: { fullName: string; cellPhone: string; email: string; isActive: boolean })
    : Promise<BaseResponseModel<UserModel>>, // PUT /v1/users/{userId}
  changePassword(userId: string, p: { oldPassword: string; newPassword: string })
    : Promise<BaseResponseModel<void>>,       // POST /v1/users/change-password/{userId}
};

// auth-store: updateUser writes BOTH keys, preserves expiresIn, forces password:''
updateUser: (user: UserModel) => void;

// use-online-status.ts
export function useOnlineStatus(): boolean; // navigator.onLine + online/offline events

const PASSWORD_REGEX = /(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/;
```

`Credentials`/`UserModel` already in `@store-mgmt/domain` — NO domain change, no `pnpm build`.

## i18n key plan (`PROFILE.*`, Spanish)

`PROFILE.EDIT_TITLE`, `CHANGE_PASSWORD_TITLE`, `FULL_NAME`, `CELL_PHONE`, `EMAIL`,
`OLD_PASSWORD`, `NEW_PASSWORD`, `CONFIRM_PASSWORD`, `SAVE`, `SAVING`, `SUCCESS`,
`ERROR`, `OFFLINE_NOTICE`, `PASSWORD_RULES`, `PASSWORD_MISMATCH`, `REQUIRED`,
`INVALID_EMAIL`. Reuse existing `MENU.EDIT_PROFILE`/`MENU.CHANGE_PASSWORD` for nav.

## Testing Strategy (strict TDD)

| Layer | What | Approach |
|-------|------|----------|
| Unit | `useOnlineStatus` toggles on events | RTL `renderHook`, dispatch `online`/`offline`. |
| Unit | `auth-store.updateUser` writes both keys + Zustand | call action, assert localStorage `AUTH_MODEL`+`CURRENT_USER` + state, `password:''`. |
| Unit | change-password client validation | regex pass/fail + confirm-mismatch blocks submit. |
| Integration | edit-profile success → `updateUser` called, navbar name | mock service, IntlProvider, assert store call. |
| Integration | change-password success → logout + `navigate('/login')` | mock service + router. |
| Integration | offline gating | mock `useOnlineStatus`→false, assert submit disabled + notice. |

## Migration / Rollout

No migration. No feature flag (EFeatures.Profile=70 + menu-config already gate access).

## Open Questions

None. Password strength and post-change logout are LOCKED.
