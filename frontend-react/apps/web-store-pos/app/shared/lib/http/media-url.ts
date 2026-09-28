/**
 * Resuelve una ruta que sirve el BACKEND (una imagen del catálogo web, por ejemplo) contra el
 * mismo origen que usan las llamadas de `api-client.ts`.
 *
 * Por qué no basta con la ruta tal cual: el backend devuelve rutas raíz-relativas
 * (`/api/v1/public/catalog/<slug>/media/<clave>`) y el SPA no siempre se sirve desde el mismo
 * origen que la API. En producción nginx publica el SPA y proxyfica `/api` (mismo origen, así que
 * la ruta relativa funciona), pero en desarrollo y en la suite E2E `API_URL` es ABSOLUTA
 * (`http://localhost:5019/api`) y un `<img src="/api/...">` pegaría al dev server (:3333), que no
 * tiene el proxy de `/api` — la imagen saldría rota.
 *
 * `API_URL` es exactamente la variable que consume `api-client.ts` como `baseURL`, así que el
 * archivo y las llamadas nunca apuntan a orígenes distintos.
 */
const API_URL = (import.meta.env['API_URL'] as string | undefined) ?? '';

export function apiFileUrl(path: string): string {
  if (!path) return path;
  // Ya absoluta (http/https): se respeta tal cual.
  if (/^https?:\/\//i.test(path)) return path;

  // `API_URL` absoluta define el origen de los archivos; relativa (o vacía) => mismo origen.
  const origin = /^https?:\/\//i.test(API_URL) ? API_URL : window.location.origin;
  return new URL(path, origin).toString();
}
