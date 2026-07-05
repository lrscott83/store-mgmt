import type { BaseModel } from '../models/base';

/**
 * BaseService<T> — sync equivalent of Angular's generic CRUD service surface
 * (create/getAllItems/getItemById/update/updateStatusForItems/delete/deleteItems),
 * collapsed to the minimal read/delete contract shared by every offline service.
 *
 * PLAIN SYNCHRONOUS return-type contract (binding, see design ADR-1):
 * NO Promise/Observable/Result/DataResult/BaseResponseModel<T>. Reads return
 * T | T[] | undefined directly; delete returns void.
 *
 * Angular's reactive-state surface (items$/isLoading$/BehaviorSubject/http/fetch)
 * is INTENTIONALLY ABSENT — in React that responsibility belongs to Zustand at the
 * component/store layer, not the offline service.
 */
export interface BaseService<T extends BaseModel> {
  getAll(): T[];
  getById(id: string): T | undefined;
  delete(id: string): void;
}
