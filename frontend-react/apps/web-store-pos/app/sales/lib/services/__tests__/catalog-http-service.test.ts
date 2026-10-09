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

describe('catalogHttpService — endpoints del módulo 18', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('HTTP-1: getStatus llama a GET /v1/catalog/status', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope({ storeSlug: 'tienda' }) as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    const result = await catalogHttpService.getStatus();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/catalog/status');
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data.storeSlug).toBe('tienda');
  });

  it('HTTP-2: getProducts llama a GET /v1/catalog/products', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope([{ id: 'p1' }]) as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    const result = await catalogHttpService.getProducts();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/catalog/products');
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data).toHaveLength(1);
  });

  it('HTTP-3: sync envía el catálogo LOCAL del POS a POST /v1/catalog/sync', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.post).mockResolvedValue(okEnvelope({ productsCreated: 2 }) as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    const snapshot = {
      categories: [{ id: 'c1', name: 'Ropa', order: 1, isActive: true }],
      products: [
        {
          id: 'p1',
          categoryId: 'c1',
          name: 'Camisa',
          price: 100,
          order: 1,
          availableToSale: true,
          isActive: true,
          discountFromInventory: true,
        },
      ],
    };
    const result = await catalogHttpService.sync(snapshot);

    // El POS es offline-first: sin snapshot el servidor publicaría su propia tabla de productos,
    // que para una tienda nueva está vacía (plan §10.1).
    expect(apiClient.post).toHaveBeenCalledWith('/v1/catalog/sync', { snapshot });
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data.productsCreated).toBe(2);
  });

  it('HTTP-3b: sync sin snapshot manda `snapshot: null` (publica el origen del servidor)', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.post).mockResolvedValue(okEnvelope({ productsCreated: 0 }) as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    await catalogHttpService.sync();

    expect(apiClient.post).toHaveBeenCalledWith('/v1/catalog/sync', { snapshot: null });
  });

  it('HTTP-4: saveProductFields envía SOLO los campos del catálogo al endpoint dedicado', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.put).mockResolvedValue(okEnvelope(true) as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    const fields = {
      description: 'Camisa de algodón',
      percentDiscountPrice: 1250,
      discountPrice: 500,
      isNew: true,
    };
    await catalogHttpService.saveProductFields('p1', fields);

    // Nunca `PUT /v1/products/{id}`: ese endpoint exige el producto completo y sobrescribiría
    // nombre, precio, orden y código de barras que esta vista no edita (decisión D8).
    expect(apiClient.put).toHaveBeenCalledWith('/v1/catalog/products/p1', fields);
  });

  it('HTTP-5: uploadImage manda el archivo como multipart', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.post).mockResolvedValue(okEnvelope('t/s/p/foto.jpg') as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    const result = await catalogHttpService.uploadImage('p1', file);

    expect(apiClient.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = vi.mocked(apiClient.post).mock.calls[0] as unknown as [
      string,
      FormData,
      { headers: Record<string, string> },
    ];
    expect(url).toBe('/v1/catalog/products/p1/images');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    // Sin este Content-Type explícito axios convierte el FormData a JSON (por la cabecera JSON por
    // defecto de `api-client`) y el backend responde 415 Unsupported Media Type.
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data).toBe('t/s/p/foto.jpg');
  });

  it('HTTP-6: removeImage pasa la clave como query param', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.delete).mockResolvedValue(okEnvelope(true) as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    await catalogHttpService.removeImage('p1', 'k/1.jpg');

    expect(apiClient.delete).toHaveBeenCalledWith('/v1/catalog/products/p1/images', {
      params: { path: 'k/1.jpg' },
    });
  });

  it('HTTP-7: reorderImages envía el orden completo', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.put).mockResolvedValue(okEnvelope(true) as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    await catalogHttpService.reorderImages('p1', ['k/2.jpg', 'k/1.jpg']);

    expect(apiClient.put).toHaveBeenCalledWith('/v1/catalog/products/p1/images/order', {
      paths: ['k/2.jpg', 'k/1.jpg'],
    });
  });

  it('HTTP-8: mediaUrl arma la URL pública de la imagen', async () => {
    const { catalogHttpService } = await import('../catalog-http-service');

    expect(catalogHttpService.mediaUrl('mi-tienda', 't/s/p/foto.jpg')).toBe(
      '/api/v1/public/catalog/mi-tienda/media/t/s/p/foto.jpg',
    );
  });

  it('HTTP-9: getPublicCatalog llama al endpoint anónimo de la tienda', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope({ storeName: 'Mi tienda' }) as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    const result = await catalogHttpService.getPublicCatalog('mi tienda');

    expect(apiClient.get).toHaveBeenCalledWith('/v1/public/catalog/mi%20tienda');
    if (!result.succeeded) throw new Error('expected succeeded response');
    expect(result.data.storeName).toBe('Mi tienda');
  });

  it('HTTP-10: getPublicProducts envía los filtros como query params', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope({ items: [], total: 0 }) as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    await catalogHttpService.getPublicProducts('mi-tienda', {
      categorySlug: 'ropa',
      search: 'camisa',
      page: 2,
      pageSize: 12,
    });

    expect(apiClient.get).toHaveBeenCalledWith('/v1/public/catalog/mi-tienda/products', {
      params: { categorySlug: 'ropa', search: 'camisa', page: 2, pageSize: 12 },
    });
  });

  it('HTTP-11: getPublicProduct pide el detalle por id publicado', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope({ id: 'cp1' }) as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    await catalogHttpService.getPublicProduct('mi-tienda', 'cp1');

    expect(apiClient.get).toHaveBeenCalledWith('/v1/public/catalog/mi-tienda/products/cp1');
  });

  it('HTTP-12: updateBranding incluye templateId en el multipart', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.put).mockResolvedValue(okEnvelope({ templateId: 'boutique' }) as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    await catalogHttpService.updateBranding({ templateId: 'boutique' });

    const [url, body, config] = vi.mocked(apiClient.put).mock.calls[0] as unknown as [
      string,
      FormData,
      { headers: Record<string, string> },
    ];
    expect(url).toBe('/v1/catalog/branding');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('templateId')).toBe('boutique');
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
  });

  it('HTTP-12b: updateBranding omite templateId cuando no viaja (PUT parcial)', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.put).mockResolvedValue(okEnvelope({}) as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    await catalogHttpService.updateBranding({ removeLogo: true });

    const [, body] = vi.mocked(apiClient.put).mock.calls[0] as unknown as [string, FormData];
    expect((body as FormData).get('templateId')).toBeNull();
    expect((body as FormData).get('removeLogo')).toBe('true');
  });
});
