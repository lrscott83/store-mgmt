import { BaseState } from "./base-state.model";

export interface BaseModel {
  id: any;
}

export interface AuditableBaseModel {
  //id: string;
  isActive: boolean;
  createdDate: Date;
  //createdBy: string;
  createdByName: string;
  updatedDate?: Date;
  //updatedBy: string;
  updatedByName?: string;
}
export interface BaseResponseModel<T> {
  data: T;
  succeeded: boolean;
  message: string;
  actionCode: number;
  errors: BaseError[];
}

export interface BaseError {
  code: string;
  description: string;
}

export interface IModelState { 
  baseState: BaseState;
  entityId: string | undefined;
}

export interface ICreateAction {
  create(): void;
}

export interface IEditAction {
  edit(id: string): void;
}

export interface IDeleteAction {
  delete(id: string): void;
}

export interface IDeleteSelectedAction {
  baseState: BaseState;
  ngOnInit(): void;
  deleteSelected(): void;
}

export interface IFetchSelectedAction {
  baseState: BaseState;
  ngOnInit(): void;
  fetchSelected(): void;
}

export interface IUpdateStatusForSelectedAction {
  baseState: BaseState;
  ngOnInit(): void;
  updateStatusForSelected(): void;
}

