import { useAuthStore } from '~/shared/lib/stores/auth-store';

/**
 * Returns the currently authenticated user's `login` for audit-trail stamping
 * (`createdByName`/`updatedByName`), matching Angular's
 * `AuthenticationService.currentUserValue?.login` used by every
 * `*.offline.service.ts` create/update mutation (frontend/ is the parity source of
 * truth).
 *
 * IMPORTANT — this deliberately reads `user.login`, NOT `user.fullName`. That is
 * Angular's actual (verified) behavior, not a bug. Do NOT "correct" this to fullName;
 * doing so breaks 100% Angular parity for these audit fields.
 *
 * Reads `useAuthStore.getState()` synchronously at call time (not the reactive hook,
 * and not cached in a module-scope constant) so every mutation stamps the CURRENT
 * user even if the session changes between calls — mirroring Angular's synchronous
 * `currentUserValue` getter.
 *
 * Returns `''` (never `undefined`) when no user is authenticated, so it's always
 * safely assignable to the non-optional `createdByName: string` domain field.
 */
export function getCurrentUserLogin(): string {
  return useAuthStore.getState().user?.login ?? '';
}
