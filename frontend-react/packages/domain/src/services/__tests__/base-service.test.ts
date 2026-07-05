import { describe, it, expect } from 'vitest';
import type { BaseService } from '../base-service';
import type { BaseModel } from '../../models/base';

interface Widget extends BaseModel {
  id: string;
  name: string;
}

class FakeWidgetService implements BaseService<Widget> {
  private items: Widget[] = [{ id: '1', name: 'a' }];

  getAll(): Widget[] {
    return this.items;
  }

  getById(id: string): Widget | undefined {
    return this.items.find((w) => w.id === id);
  }

  delete(id: string): void {
    this.items = this.items.filter((w) => w.id !== id);
  }
}

describe('BaseService<T>', () => {
  it('is implementable with getAll/getById/delete matching the sync contract', () => {
    const svc: BaseService<Widget> = new FakeWidgetService();
    expect(svc.getAll()).toHaveLength(1);
    expect(svc.getById('1')?.name).toBe('a');
    expect(svc.getById('missing')).toBeUndefined();
    svc.delete('1');
    expect(svc.getAll()).toHaveLength(0);
  });
});
