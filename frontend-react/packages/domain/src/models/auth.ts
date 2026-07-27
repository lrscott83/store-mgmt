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
