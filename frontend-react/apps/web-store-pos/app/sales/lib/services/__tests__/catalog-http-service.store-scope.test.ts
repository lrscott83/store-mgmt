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
 * Cliente store-scoped del SuperAdmin (2026-10-22). La tienda viaja en la RUTA
 * (`/v1/stores/{storeId}/catalog/...`) porque un SuperAdmin no tiene tienda seleccionada: el
 * cliente del dueño sigue hablando con `/v1/catalog/...` y no se toca.
 */
describe('catalogClientForStore — endpoints store-scoped del SuperAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('SCOPE-HTTP-1: getStatus pega en /v1/stores/{storeId}/catalog/status', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope({ storeSlug: 'tienda' }) as never);

    const { catalogClientForStore } = await import('../catalog-http-service');
    await catalogClientForStore('store-42').getStatus();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/stores/store-42/catalog/status');
  });

  it('SCOPE-HTTP-2: la marca también es store-scoped', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope({ logoKey: null }) as never);

    const { catalogClientForStore } = await import('../catalog-http-service');
    await catalogClientForStore('store-42').getBranding();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/stores/store-42/catalog/branding');
  });

  it('SCOPE-HTTP-3: el reordenado del showcase es store-scoped', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.put).mockResolvedValue(okEnvelope(true) as never);

    const { catalogClientForStore, CatalogShowcaseKind } = await import('../catalog-http-service');
    await catalogClientForStore('store-42').reorderShowcaseImages(CatalogShowcaseKind.Carousel, [
      'img-1',
    ]);

    expect(apiClient.put).toHaveBeenCalledWith('/v1/stores/store-42/catalog/showcase/order', {
      kind: CatalogShowcaseKind.Carousel,
      orderedIds: ['img-1'],
    });
  });

  it('SCOPE-HTTP-4: sync sin snapshot publica el origen del servidor de ESA tienda', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.post).mockResolvedValue(okEnvelope({ productsCreated: 0 }) as never);

    const { catalogClientForStore } = await import('../catalog-http-service');
    await catalogClientForStore('store-42').sync();

    expect(apiClient.post).toHaveBeenCalledWith('/v1/stores/store-42/catalog/sync', {
      snapshot: null,
    });
  });

  it('SCOPE-HTTP-5: el cliente del dueño sigue usando /v1/catalog (sin cambios)', async () => {
    const { apiClient } = await import('~/shared/lib/http/api-client');
    vi.mocked(apiClient.get).mockResolvedValue(okEnvelope({ storeSlug: 'tienda' }) as never);

    const { catalogHttpService } = await import('../catalog-http-service');
    await catalogHttpService.getStatus();

    expect(apiClient.get).toHaveBeenCalledWith('/v1/catalog/status');
  });
});
