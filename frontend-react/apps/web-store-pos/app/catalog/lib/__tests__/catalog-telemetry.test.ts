import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackCatalogEvent } from '../catalog-telemetry';

const fetchMock = vi.fn();

function lastBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

function lastUrl(): string {
  return fetchMock.mock.calls[0][0] as string;
}

describe('trackCatalogEvent — telemetría anónima del catálogo', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState(
      {},
      '',
      '/catalog/mi-tienda?utm_source=whatsapp&utm_medium=social&utm_campaign=verano',
    );
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://wa.me/5355555555',
    });
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: undefined });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it('manda page_view con ruta, referrer y UTM, sin bloquear', () => {
    trackCatalogEvent('mi-tienda', { name: 'page_view' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastUrl()).toContain('/v1/public/catalog/mi-tienda/events');
    const body = lastBody();
    expect(body.events).toEqual([
      expect.objectContaining({
        name: 'page_view',
        path: '/catalog/mi-tienda',
        referrer: 'https://wa.me/5355555555',
        utmSource: 'whatsapp',
        utmMedium: 'social',
        utmCampaign: 'verano',
      }),
    ]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.keepalive).toBe(true);
  });

  it('incluye productId en los eventos de producto', () => {
    trackCatalogEvent('mi-tienda', { name: 'product_view', productId: 'p1' });

    expect(lastBody().events).toEqual([
      expect.objectContaining({ name: 'product_view', productId: 'p1' }),
    ]);
  });

  it('respeta Do Not Track y no manda nada', () => {
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: '1' });

    trackCatalogEvent('mi-tienda', { name: 'page_view' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un fallo de red no lanza ni rompe el catálogo', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    expect(() => trackCatalogEvent('mi-tienda', { name: 'page_view' })).not.toThrow();
    await Promise.resolve();
  });
});
