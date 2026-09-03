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
}

export interface OfflineRosterBundle {
  bundleId: string;
  issuedAt: number;
  expiresAt: number;
  formatVersion: number;
  storeId: string;
  users: OfflineRosterUser[];
}
