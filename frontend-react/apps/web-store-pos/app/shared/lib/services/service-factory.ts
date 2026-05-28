import { GlobalConfig } from '../config/global-config';

export interface ServiceImpl<T> {
  getAll(): T[];
  getById(id: string): T | undefined;
  create(item: T): T;
  update(item: T): T;
  delete(id: string): void;
}

export function createService<T>(
  offline: ServiceImpl<T>,
  online: ServiceImpl<T>
): ServiceImpl<T> {
  return GlobalConfig.USE_ONLINE_SERVICE ? online : offline;
}
