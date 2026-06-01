# Design: Migrate Angular admin/features → React (1:1 parity)

## Technical Approach

Mirror the `management/*` template exactly: a container route under `admin/features/routes/` plus an http-service under `admin/features/lib/services/`, each with co-located `__tests__`. Add a strict `superAdminLoader` (isSuperAdmin ONLY) to `auth/routes/loaders.ts`, register the route under the existing `app-layout` in `routes.ts`, and add self-contained `FEATURES.*` keys to `es.ts`. No new layout, no toasts, no loading state — inline success/error only. Strict 1:1 parity per proposal.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Auth guard | New `superAdminLoader` (isSuperAdmin only) | Reuse `adminLoader` (isSuperAdmin \|\| isOwnerAdmin) | Angular gates on SuperAdmin only; reusing the broadened guard would widen access. Establishes the strict guard for future admin slices. |
| Layout | Reuse `app-layout` | New `admin/` layout | Angular has no separate admin layout. |
| Feedback UX | Inline `useState` success/error | toastr/toast | Avoids a toast dependency; Angular used toastr but proposal locks inline. |
| i18n keys | Self-contained `FEATURES.*` (incl. SUCCESS/ERROR) | `GENERAL.RESPONSE.*` | Verified those keys do NOT exist in React `es.ts`; self-contained avoids missing-key risk. |
| Service shape | `featureHttpService` object, `apiClient.post`, returns `response.data` | class/instance | Matches `userHttpService` pattern exactly (`user-http-service.ts:26-78`). |

## Data Flow

    FeaturesPage (button click)
         │  featureHttpService.activateFeatures()
         ▼
    apiClient.post('/v1/features/activate', {})  ──→  BaseResponseModel<boolean>
         │                                                    │
         ▼ on resolve → setSuccess(FEATURES.SUCCESS)          │
         ▼ on reject  → setError(FEATURES.ERROR)  ◄───────────┘
    Route guarded by superAdminLoader (isSuperAdmin only)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `apps/web-store-pos/app/admin/features/routes/features.tsx` | Create | `loader = superAdminLoader`; `FeaturesPage` renders title + single activate button; `useIntl` + `useState` for inline success/error; default export. |
| `apps/web-store-pos/app/admin/features/lib/services/feature-http-service.ts` | Create | `featureHttpService.activateFeatures()` → `apiClient.post<BaseResponseModel<boolean>>('/v1/features/activate', {})`, returns `response.data`. |
| `apps/web-store-pos/app/admin/features/routes/__tests__/features.test.tsx` | Create | Mocks `~/auth/routes/loaders` + service; asserts exports, render (title+button), click→success text, click→error text. |
| `apps/web-store-pos/app/admin/features/lib/services/__tests__/feature-http-service.test.ts` | Create | Mocks `~/shared/lib/http/api-client`; asserts POST `/v1/features/activate` with `{}`, returns boolean. |
| `apps/web-store-pos/app/auth/routes/loaders.ts` | Modify | Add `superAdminLoader` (auth check → redirect `/login`; `!user.isSuperAdmin` → redirect `/unauthorized`). |
| `apps/web-store-pos/app/routes.ts` | Modify | Add `route('admin/features', 'admin/features/routes/features.tsx')` under `app-layout`. |
| `apps/web-store-pos/app/shared/lib/i18n/es.ts` | Modify | Add `FEATURES.TITLE`, `FEATURES.ACTIVATE`, `FEATURES.SUCCESS`, `FEATURES.ERROR`. |

> `en.ts` does NOT exist — no en changes.

## Interfaces / Contracts

```ts
// feature-http-service.ts
import type { BaseResponseModel } from '@store-mgmt/domain';
import { apiClient } from '~/shared/lib/http/api-client';

export const featureHttpService = {
  async activateFeatures(): Promise<BaseResponseModel<boolean>> {
    const response = await apiClient.post<BaseResponseModel<boolean>>('/v1/features/activate', {});
    return response.data;
  },
};

// loaders.ts (new export)
export async function superAdminLoader(): Promise<Response | null> {
  const { user, isAuthenticated } = getAuthState();
  if (!user || !isAuthenticated) return redirect('/login');
  if (!user.isSuperAdmin) return redirect('/unauthorized');
  return null;
}
```

`BaseResponseModel<T>` from `@store-mgmt/domain` (`packages/domain/src/models/base.ts`): `{ data, succeeded, message, actionCode, errors }`. `UserModel.isSuperAdmin: boolean` (`models/auth.ts:31`).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit (service) | POST `/v1/features/activate` with `{}`, returns `response.data` | vitest, mock `api-client` (mirror `user-http-service.test.ts`) |
| Unit (route) | exports `loader`+`FeaturesPage`; renders title+button; click sets success; click failure sets error | vitest + RTL, `IntlProvider` w/ `esMessages`, mock loaders + service (mirror `configurations.test.tsx`) |
| E2E | — | None (parity slice) |

## Migration / Rollout

No migration required. Rollback = revert `routes.ts`/`loaders.ts`/`es.ts` edits and delete `admin/features/`.

## Open Questions

- None. Activate-button label and inline messages use new `FEATURES.*` keys; exact Spanish copy decided at apply time.
