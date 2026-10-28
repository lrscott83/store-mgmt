import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/shared/lib/http/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const okEnvelope = (data: unknown) => ({ data: { succeeded: true, data } });

/**
 * Alta directa del SuperAdmin (T3): la MISMA categoría y el MISMO producto del catálogo, pero
 * store-scoped porque la tienda sale de la ruta. El cliente del dueño (`catalogHttpService`)
 * sigue hablando con `/v1/catalog/...` y no se toca.
 */
describe('catalogClientForStore — alta directa de categorías y productos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ADMIN-HTTP-1: getCategories lista las categorías de la tienda de la ruta', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(
      okEnvelope([{ id: 'c1', name: 'Ropa', order: 1 }]) as never,
    );

    const { catalogClientForStore } = await import('../catalog-http-service');
    const result = await catalogClientForStore('store-42').getCategories();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/stores/store-42/catalog/categories');
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data).toEqual([{ id: 'c1', name: 'Ropa', order: 1 }]);
  });

  it('ADMIN-HTTP-2: createCategory manda nombre y orden al endpoint store-scoped', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.post).mockResolvedValue(
      okEnvelope({ id: 'c2', name: 'Bebidas', order: 3 }) as never,
    );

    const { catalogClientForStore } = await import('../catalog-http-service');
    const result = await catalogClientForStore('store-42').createCategory({
      name: 'Bebidas',
      order: 3,
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/stores/store-42/catalog/categories', {
      name: 'Bebidas',
      order: 3,
    });
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data).toEqual({ id: 'c2', name: 'Bebidas', order: 3 });
  });

  it('ADMIN-HTTP-2b: createCategory sin orden no inventa la clave (el backend la pone al final)', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.post).mockResolvedValue(
      okEnvelope({ id: 'c2', name: 'Bebidas', order: 9 }) as never,
    );

    const { catalogClientForStore } = await import('../catalog-http-service');
    await catalogClientForStore('store-42').createCategory({ name: 'Bebidas' });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/stores/store-42/catalog/categories', {
      name: 'Bebidas',
    });
  });

  it('ADMIN-HTTP-3: createProduct manda el alta completa y devuelve el id', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.post).mockResolvedValue(okEnvelope({ id: 'p-new' }) as never);

    const { catalogClientForStore } = await import('../catalog-http-service');
    const payload = {
      categoryId: 'c1',
      name: 'Camisa',
      price: 12.5,
      currency: 1,
      description: 'Azul',
      order: 4,
    };
    const result = await catalogClientForStore('store-42').createProduct(payload);

    expect(apiClient.post).toHaveBeenCalledWith('/v1/stores/store-42/catalog/products', payload);
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data).toEqual({ id: 'p-new' });
  });

  it('ADMIN-HTTP-3b: createProduct omite lo que no viaja (descripción, moneda y orden)', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.post).mockResolvedValue(okEnvelope({ id: 'p-new' }) as never);

    const { catalogClientForStore } = await import('../catalog-http-service');
    await catalogClientForStore('store-42').createProduct({
      categoryId: 'c1',
      name: 'Camisa',
      price: 12.5,
    });

    const [, body] = vi.mocked(apiClient.post).mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(body).toEqual({ categoryId: 'c1', name: 'Camisa', price: 12.5 });
  });
});
