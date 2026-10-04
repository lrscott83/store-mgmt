# device-key-read-failure-guard

## Objective

Impedir que `getOrCreateDeviceKey` reemplace (sobrescriba) la llave de dispositivo
existente cuando la lectura de IndexedDB **falla** en vez de devolver "no existe".
Añadir trazas (consola + client-log) con el estado previo de la tabla y el
mensaje/stack de la excepción, y tests de regresión.

## Problem

`readKeyRecord` convierte cualquier error de lectura en `null`, y
`getOrCreateDeviceKey` interpreta `null` como "sin llave": genera una nueva y la
escribe con `put`, sobrescribiendo la anterior. Consecuencia real observada: la
llave se rotó (2026-10-04 13:12:43) y el wrap `device` quedó huérfano, provocando
el unlock gate (`/login?unlock=1`) en cada recarga.

## Scope / constraints

- Solo frontend React (`frontend-react/apps/web-store-pos`). Angular intacto.
- No se tocan E2E existentes. Se agregan tests unitarios nuevos.
- No cambia el contrato de redirección de sesión; lo refuerza (menos rebotes).
- Sin commit (no solicitado).

## Route

Delegated-direct inline: un solo módulo + su test, con el análisis completo ya en
manos del padre; delegar exigiría re-derivar el contexto.

## Tasks

- [x] T1 — `readKeyRecord` devuelve `found | absent | error` (deja de colapsar a null).
- [x] T2 — `getOrCreateDeviceKey`: en `error` NO crea llave; en `absent` crea con `add` (no `put`) y adopta la ganadora si hubo carrera.
- [x] T3 — single-flight memo (evita doble mint concurrente).
- [x] T4 — logging (consola + client-log) con tabla previa + nombre/mensaje/stack.
- [x] T5 — tests: read-failure no sobrescribe; concurrencia = una sola llave.
- [x] T6 — correr el test file y typecheck.

## Verification evidence

- `pnpm exec vitest run app/shared/lib/storage/__tests__/device-key-store.test.ts` → 8/8 passed.
- Suite de impacto (storage + `dek-provisioning` + `loaders`) → 20 files, 244 tests passed.
- `pnpm typecheck` → OK. `eslint` sobre los 2 archivos → limpio.
- Sin commit (no solicitado).

## Pendiente (no autorizado aún)

- Caída de `bootstrapDeviceDek` a `table.stores[table.storeId]` para auto-reparar
  dispositivos ya rotos sin intervención manual.


## Acceptance

- Con una lectura fallida, la llave previa sigue intacta y la función devuelve null.
- Dos llamadas concurrentes comparten una sola llave.
- Existe una entrada de log con el error y el estado previo de `lizoft.device-dek`.
