import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadHelper() {
  vi.resetModules();
  return import('../media-url');
}

describe('apiFileUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('resuelve la ruta del backend contra el origen de la app cuando API_URL no es absoluta', async () => {
    vi.stubEnv('API_URL', '');
    const { apiFileUrl } = await loadHelper();

    expect(apiFileUrl('/api/v1/public/catalog/tienda/media/k/1.jpg')).toBe(
      `${window.location.origin}/api/v1/public/catalog/tienda/media/k/1.jpg`,
    );
  });

  it('usa el origen de API_URL cuando es absoluta (dev y suite E2E)', async () => {
    vi.stubEnv('API_URL', 'http://localhost:5019/api');
    const { apiFileUrl } = await loadHelper();

    expect(apiFileUrl('/api/v1/public/catalog/tienda/media/k/1.jpg')).toBe(
      'http://localhost:5019/api/v1/public/catalog/tienda/media/k/1.jpg',
    );
  });

  it('deja intacta una URL que ya viene absoluta', async () => {
    vi.stubEnv('API_URL', 'http://localhost:5019/api');
    const { apiFileUrl } = await loadHelper();

    expect(apiFileUrl('https://cdn.example.com/foto.jpg')).toBe('https://cdn.example.com/foto.jpg');
  });

  it('devuelve una cadena vacía sin tocar y no falla', async () => {
    vi.stubEnv('API_URL', '');
    const { apiFileUrl } = await loadHelper();

    expect(apiFileUrl('')).toBe('');
  });
});
