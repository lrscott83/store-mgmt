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
  | {
      data: T;
      succeeded: true;
      message: string | null;
      actionCode: number | null;
      errors: BaseError[];
    }
  | {
      data: null;
      succeeded: false;
      message: string | null;
      actionCode: number | null;
      errors: BaseError[];
    };

export interface BaseError {
  code: string;
  description: string;
}

/**
 * seamless-store-switch v2 — wire shape of the backend's
 * `SwitchMyStoreResult` (PUT /v1/stores/switch). The wrap fields are EMPTY
 * whenever the client cannot benefit (no selection change, first session,
 * wrap failure) — the client then falls back to its per-store device wrap
 * table, and only logs out when that is absent too.
 */
export interface SwitchMyStoreResult {
  changed: boolean;
  wrappedDek: string;
  wrapSalt: string;
  wrapIv: string;
}
