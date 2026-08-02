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
  verifier: OfflineVerifier;
  /**
   * Optional at-rest-encryption wrap fields, mirroring the backend's
   * `OfflineRosterUserDto`. Absent/empty on a `formatVersion: 1` bundle
   * (today's shape); non-empty on a `formatVersion: 2` bundle for a user
   * whose DEK is wrapped. The backend defaults these to `""`, not `null`.
   */
  wrappedDek?: string;
  wrapSalt?: string;
  wrapIv?: string;
}

export interface OfflineRosterBundle {
  bundleId: string;
  issuedAt: number;
  expiresAt: number;
  formatVersion: number;
  storeId: string;
  users: OfflineRosterUser[];
}
