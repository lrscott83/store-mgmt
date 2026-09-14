# Plan — Registro local de errores y logs para depurar la PWA en dispositivos (client-error-log)

Fecha: 2026-09-14 · Estado: implementado

## 1. Problema

La app es una PWA offline-first instalada en teléfonos/PCs de campo. Cuando algo falla en un
dispositivo (pantalla en blanco, error de consola, fallo de IndexedDB/localStorage, error de red),
hoy **no hay forma de ver qué pasó**: no hay teclado de desarrollador en el teléfono, el usuario
no sabe copiar un stack trace, y el error muere con la sesión.

La consola remota (`chrome://inspect` por USB) solo sirve con el dispositivo delante y un PC —
no resuelve el caso real: *el usuario reporta "no funciona" y hace falta saber qué pasó en SU
dispositivo, horas después*.

## 2. Estrategia elegida — buffer local + exportar/compartir

Guardar en el dispositivo un **anillo de errores y logs importantes** (localStorage), y dar al
Owner/SuperAdmin una **vista de Diagnóstico** para revisarlos y **exportarlos/compartirlos**
(archivo descargado o `navigator.share` del sistema, que en PWA instalada abre WhatsApp/correo
directamente). Cero backend, cero servicios externos — coherente con la filosofía offline.

### Alternativas descartadas (documentadas para no re-debatir)

| Alternativa | Por qué no (v1) |
|---|---|
| Sentry/crash reporting externo | Requiere internet siempre + cuenta externa + SDK; contradice offline-first. |
| POST de logs al backend cuando hay red | Útil a futuro, pero hoy obligaría a tocar backend production code (regla CLAUDE.md) y a definir endpoint+retención. Queda como fase 2 opcional. |
| Solo `chrome://inspect` USB | No sirve para dispositivos remotos ni para errores que ocurren sin nadie mirando. |

## 3. Diseño

### 3.1 Módulo core — `app/shared/lib/diagnostics/client-log.ts` (NUEVO)

Módulo **hoja** (cero imports de stores/http — misma pureza que `offline-session.ts`) para que
el instalador global pueda montarse *antes* de cualquier otro módulo y no arrastre nada.

```ts
type LogLevel = 'error' | 'warn' | 'info';

interface ClientLogEntry {
  ts: number;            // epoch ms
  level: LogLevel;
  message: string;       // truncado a ~500 chars
  location?: string;     // stack del error (primeras ~3 líneas) o pathname
  route?: string;        // location.pathname al ocurrir
  count?: number;        // dedup: repeticiones consecutivas colapsadas
  context?: Record<string, string | number | boolean | null>;
}
```

Comportamiento:
- **Ring buffer** en `localStorage` bajo `lizoft.client-log-v1`: máximo **200 entradas**, FIFO.
- **Prune temporal**: entradas con más de **7 días** se eliminan al escribir.
- **Dedup**: si la última entrada tiene mismo `level+message+location`, incrementa `count`
  (evita que un loop de errores llene el buffer en segundos).
- **Escritura tolerante a fallos**: si `setItem` lanza (quota), descarta la entrada más vieja y
  reintenta una vez; si vuelve a fallar, conserva el buffer solo en memoria de la sesión.
- **Redacción**: antes de guardar se reemplazan patrones `Bearer <jwt>`, `offline-session`,
  y cualquier campo con nombre `token|password|offlineAuthToken|dek` por `[REDACTED]`.
- API: `logClientError(entry)`, `getClientLogs()`, `clearClientLogs()`,
  `exportClientLogs(selectedStoreId?)` → JSON pretty con cabecera de metadatos del dispositivo
  (`APP_VERSION`, `userAgent`, `onLine`, `language`, `timestamp`, `selectedStoreId`).

### 3.2 Instalador de hooks globales — `app/shared/lib/diagnostics/install-client-log.ts` (NUEVO)

Se llama una sola vez al boot, **antes** del render (`root.tsx`). Engancha:

1. `window.addEventListener('error')` → `logClientError({ level:'error', message, location: stack })`.
2. `window.addEventListener('unhandledrejection')` → mismo, con `reason`.
3. `console.error`/`console.warn` envueltos (llaman al original Y capturan) — así todo lo que hoy
   ya se imprime en consola queda retenido sin tocar cada call-site.
4. `online`/`offline` → entradas `info` (cuándo el dispositivo perdió y recuperó red — oro para
   diagnosticar el modo offline).

Devuelve `uninstallClientLog()` para tests.

### 3.3 Puntos de integración (mínimos, ficheros existentes tocados al mínimo)

| Fichero | Cambio |
|---|---|
| `app/root.tsx` | Instalar el logger al boot; el `ErrorBoundary` llama `logClientError(...)` con el error de ruta (antes de la política de descifrado). |
| `app/shared/lib/http/api-client.ts` | En el path de error del interceptor de respuesta: `logClientError` con método/URL/status/`isNetworkError`. **Nunca** loguear headers ni bodies. |
| `app/shared/lib/storage/decryption-failure-policy.ts` | En `handleDecryptionFailure`, una llamada `logClientError` (el fallo de descifrado es el bug más difícil de reproducir en campo). |
| `app/shared/lib/storage/storage-keys.ts` | La clave `lizoft.client-log-v1` vive **fuera** de `BUSINESS_ENTITY_NAMES` (es dato de dispositivo, no de tienda) — no entra en export/import de datos. |

### 3.4 Vista de Diagnóstico — `app/diagnostics/routes/diagnostics.tsx` (NUEVA)

- Ruta `/diagnostics` en `routes.ts`; entrada de menú en `menu-config.ts` en la sección de
  Configuraciones/Ayuda, visible **solo para SuperAdmin u OwnerAdmin** (mismo gate por rol que el
  botón demo — sin feature de backend nuevo).
- Muestra: lista de entradas (fecha-hora local, nivel con color, mensaje, count si está
  deduplicada), filtro por nivel y búsqueda de texto, y una tarjeta de **info del dispositivo**
  (versión, userAgent, online, uso de storage).
- Acciones:
  - **Compartir** (`navigator.share` con `File` `client-log-<fecha>.json`) — si no está
    disponible (desktop), fallback a **Descargar** (Blob + `a[download]`).
  - **Copiar** al portapapeles.
  - **Limpiar** registro (confirmación).
- i18n: claves nuevas en `es.ts` bajo `DIAGNOSTICS.*`.

### 3.5 Privacidad

- Nunca se capturan: cuerpos de peticiones/respuestas, `Authorization`, JWT del roster, DEKs,
  datos de entidades.
- El export es **manual y explícito** del usuario — nada sale del dispositivo sin que el Owner
  decida compartirlo.

## 4. Tests

| Suite | Casos |
|---|---|
| `client-log.test.ts` (unit, nuevo) | ring cap 200 (FIFO), prune >7 días, dedup con count, redacción de `Bearer`/tokens, fallback quota-exceeded, `exportClientLogs` incluye metadatos del dispositivo. |
| `install-client-log.test.ts` (unit, nuevo) | `window.error` y `unhandledrejection` quedan en el buffer; wrapper de `console.error` llama al original y captura; eventos `offline`/`online` generan `info`; `uninstall` restaura todo. |
| `root.test.tsx` (existente, ajuste) | ErrorBoundary ahora llama `logClientError` (mock del módulo, aserción de llamada). |
| `api-client.test.ts` (existente, ajuste) | un fallo HTTP 500 y un fallo de red generan la entrada esperada (mock de `client-log`). |
| `diagnostics.test.tsx` (unit, nuevo) | vista renderiza entradas y filtros; botón Compartir usa `navigator.share` cuando existe y Descarga cuando no; Limpiar vacía el buffer tras confirmar. |
| **E2E (nuevo spec, permitido)** | `frontend-react/e2e/diagnostics.spec.ts`: inyectar un error vía `page.evaluate`, abrir `/diagnostics` como owner, ver la entrada, verificar el export. No se toca ningún spec existente (regla CLAUDE.md). |

## 5. Pasos de implementación (TDD)

1. `client-log.ts` — test rojo → implementar → verde. ✅
2. `install-client-log.ts` — test rojo → implementar → verde; integrar en `root.tsx`. ✅
3. Integraciones puntuales: `api-client.ts`, `decryption-failure-policy.ts`, ErrorBoundary (con sus tests). ✅
4. Vista Diagnóstico + ruta + menú + i18n (TDD). ✅
5. Spec E2E nuevo. ✅
6. Suite completa frontend (vitest + typecheck + lint) verde + suite E2E. ✅

## 6. Fuera de alcance v1 (explícito)

- Envío automático de logs al backend (fase 2: endpoint + cola cuando hay red).
- Captura de `console.log` informativo (solo error/warn para no llenar el buffer de ruido).
- Sourcemaps: los stacks llegan minificados; se guarda el mensaje + ruta de archivo/línea tal
  cual — suficiente para correlacionar con la versión (`APP_VERSION`) y reproducir local.
- Persistencia IndexedDB (localStorage con cap 200 + 7 días es suficiente para diagnóstico;
  si algún día se quiere más histórico, migrar el buffer a IndexedDB es un cambio local del módulo).
