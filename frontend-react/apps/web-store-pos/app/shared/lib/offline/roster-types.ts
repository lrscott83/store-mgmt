// Type-only module (design D1) — erased at compile time, so importing it
// never triggers any runtime evaluation. `roster-store.ts` imports from here
// via `import type` ONLY, which is exactly what its purity contract requires.
import type { StoreModuleFeatures } from '@store-mgmt/domain';

export interface OfflineVerifier {
  hash: string;
  salt: string;
  iterations: number;
}

export interface OfflineRosterUser {
  id: string;
  login: string;
  fullName: string;
  isActive: boolean;
  roles: StoreModuleFeatures[];
  featureIds: number[];
  storeModuleIds: number[];
  isSuperAdmin: boolean;
  isOwnerAdmin: boolean;
  isReSeller: boolean;
  selectedStoreId: string;
  /**
   * `null` when the backend has no persisted `OfflinePasswordPreHash` for this
   * user yet (never logged in / never had a password set since the
   * offline-password-verifier change shipped) — distinct from an absent or
   * malformed field. `offline-auth-service.ts`'s `typeof` guard treats this
   * exactly like a missing verifier and throws `OfflineVerifierError`.
   */
  verifier: OfflineVerifier | null;
  /**
   * Optional at-rest-encryption wrap fields, mirroring the backend's
   * `OfflineRosterUserDto`. Absent/empty on a `formatVersion: 1` bundle
   * (today's shape); non-empty on a `formatVersion: 2` bundle for a user
   * whose DEK is wrapped. The backend defaults these to `""`, not `null`.
   */
  wrappedDek?: string;
  wrapSalt?: string;
  wrapIv?: string;
  /**
   * Signed JWT minted by the backend at export time, valid until the roster
   * bundle's `expiresAt`. Used as the offline session's bearer token so
   * API calls (e.g. daily store-usage telemetry) authenticate without an
   * online login. Absent on legacy bundles and on exports from backends
   * predating this field — `offline-auth-service.ts` falls back to the
   * `OFLINE_SESSION_TOKEN` sentinel, exactly today's behavior.
   */
  offlineAuthToken?: string;
  /**
   * Billing snapshot exported by the backend for each roster user
   * (`PaymentDueDate` serialized as ISO "yyyy-MM-dd", `IsInTrial`,
   * `PaymentStatus`). Absent on legacy bundles saved before the backend
   * shipped these fields — `offline-auth-service.ts` falls back to sober
   * no-billing-data defaults for those.
   */
  paymentDueDate?: string | null;
  isInTrial?: boolean;
  paymentStatus?: string;
  /**
   * store-list-active-stores: the owner's full store list (id + name +
   * `isActive`), carried on OwnerAdmin rows so an offline OwnerAdmin sees the
   * same active-store selection as online (mirrors /me's StoreList).
   * Non-owner rows carry an empty list, exactly like /me. Absent on legacy
   * bundles from backends predating the field — consumers treat absence as
   * "no store list available" and fall back to the current store only,
   * the same self-healing as a cached /me without `isActive`.
   */
  storeList?: RosterStoreSummary[];
}

/**
 * Store summary inside a roster user's `storeList` — same shape as
 * `StoreSummary` from auth/me (camelCase over the backend's
 * `StoreSummaryDto { Id, Name, IsActive }`), duplicated here because this
 * module is type-only and must not import runtime-coupled models.
 */
export interface RosterStoreSummary {
  id: string;
  name: string;
  isActive: boolean;
}

export interface OfflineRosterBundle {
  bundleId: string;
  issuedAt: number;
  expiresAt: number;
  formatVersion: number;
  storeId: string;
  users: OfflineRosterUser[];
}
