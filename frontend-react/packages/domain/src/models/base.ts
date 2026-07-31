export interface BaseModel {
  id: unknown;
}

export interface AuditableBaseModel extends BaseModel {
  isActive: boolean;
  createdDate: Date;
  createdByName: string;
  updatedDate?: Date;
  updatedByName?: string;
}

export type BaseResponseModel<T> =
  | { data: T; succeeded: true; message: string | null; actionCode: number | null; errors: BaseError[] }
  | { data: null; succeeded: false; message: string | null; actionCode: number | null; errors: BaseError[] };

export interface BaseError {
  code: string;
  description: string;
}
