export interface Credentials {
  userId: string;
  oldPassword: string;
  newPassword: string;
}

export interface AuthModel {
  login: string;
  authToken: string;
  refreshToken: string;
  expiresIn: number;
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
