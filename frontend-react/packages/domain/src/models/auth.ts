export interface Credentials {
  userId: string;
  oldPassword: string;
  newPassword: string;
}

/**
 * One store's DEK, wrapped under this user's password pre-hash — the per-store
 * sibling of `AuthModel`'s top-level `wrappedDek`/`wrapSalt`/`wrapIv`
 * (backend `AuthDto.StoreDekWraps`, same `StoreKeyWrapService.WrapDek` format,
 * byte-compatible with the roster's per-user wrap). The login response carries
 * one entry per store the user can switch to, so the device can hold a
 * per-store wrap table (device-dek-table v2) and later switch stores in-session
 * — no logout, no password. See
 * docs/plans/2026-09-10-seamless-store-switch-plan.md.
 */
export interface StoreDekWrap {
  storeId: string;
  wrappedDek: string;
  wrapSalt: string;
  wrapIv: string;
}

export interface AuthModel {
  login: string;
  authToken: string;
  refreshToken: string;
  expiresIn: number;
  /**
   * The store's data key, wrapped under this user's password
   * (`Dtos/Authentication/AuthDto.cs`, populated by
   * `LoginCommandHandler.TryBuildLoginDekWrapAsync`). Byte-compatible with the
   * roster's per-user wrap, so these three go straight into `unwrapDek`'s
   * `WrappedDekEntry` with no translation. Optional here because the DTO
   * defaults them to `""` — the contract's own "the wrap could not be
   * produced" signal, which degrades the login instead of failing it — and
   * because Register/Refresh responses carry them empty too.
   */
  wrappedDek?: string;
  wrapSalt?: string;
  wrapIv?: string;
  /**
   * Wraps for EVERY store the user can switch to (login path only; absent on
   * Register/Refresh and when the server could not produce them). Optional for
   * the same reason the top-level fields are: the contract's "not available"
   * signal, which degrades in-session store switching to the legacy logout
   * flow instead of failing the login.
   */
  storeDekWraps?: StoreDekWrap[];
}

/**
 * Payload returned by `POST /api/v1/auth/register` (`ResponseResult<AuthDto>`).
 * `authToken` is typed here but deliberately NOT consumed by the register
 * call-site — Angular parity navigates to /login without auto-authenticating
 * (see register-endpoint-contract-frontend Decision 1). `refreshToken` is
 * intentionally absent, not optional: RegisterCommand.cs:132 never populates
 * one, and omitting it (plus `expiresIn` being a string here vs a number on
 * `AuthModel`) keeps this type structurally non-assignable to `AuthModel` in
 * both directions.
 */
export interface RegisterAuthModel {
  login: string;
  authToken: string;
  /** ISO-8601 timestamp (backend DateTime), NOT epoch ms like AuthModel.expiresIn. */
  expiresIn: string;
}

/** Resumen de tienda del owner devuelto por auth/me (StoreList): id + nombre. */
export interface StoreSummary {
  id: string;
  name: string;
}

export interface StoreModuleFeatures {
  storeId: string;
  storeName: string;
  moduleId: number;
  featureIds: number[];
}

export type PaymentStatus = 'NoAplica' | 'AlDia' | 'PorVencer' | 'EnGracia' | 'Vencido';

export interface UserModel extends AuthModel {
  id: string;
  fullName: string;
  cellPhone: string;
  email: string;
  isActive: boolean;
  password: string;
  roles: StoreModuleFeatures[];
  featureIds: number[];
  storeModuleIds: number[];
  isSuperAdmin: boolean;
  isOwnerAdmin: boolean;
  isReSeller: boolean;
  /** Tiendas del owner (auth/me, solo OwnerAdmin) — resuelve el nombre destino de sale_out. */
  storeList?: StoreSummary[];
  selectedStoreId: string;
  paymentDueDate: string | null;
  isInTrial: boolean;
  paymentStatus: PaymentStatus;
}

export interface LoginRequest {
  login: string;
  password: string;
}

export interface RegisterRequest {
  fullName: string;
  login: string;
  email: string;
  cellPhone: string;
  password: string;
  storeName: string;
  code?: string;
}
