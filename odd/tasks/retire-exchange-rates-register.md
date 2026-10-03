# Feature: retire-exchange-rates-register

Rama: árbol de trabajo actual. Alcance autorizado: **solo `frontend-react/`** (más este doc). Sin backend, sin migraciones de base de datos.

## Objetivo

Eliminar del menú **"Cambio USD a MN"** (registro diario del cambio) y, en el mismo acto, resolver sus datos:

1. Si la tienda **no tiene** MultiMonedas → los datos del registro se **borran** de la memoria local.
2. Si la tienda **sí tiene** MultiMonedas → los datos se **mueven** al registro de canales de pago, canal **Efectivo CUP**, con `buyValue === sellValue`. Después se borran igual.

El destino ya existe y es el que hoy muestra el menú **"Tasas de Cambio"** (`/management/channel-rates`), que es append-only por `effectiveFrom`.

## Problema / por qué

Hoy conviven dos registros de lo mismo:

- **Registro diario del cambio** (`ExchangeRateOfflineService`, `localStorage`, cifrado): una fila por día calendario, autogenerado. Solo permite editar el valor de un día. No tiene create ni delete por diseño.
- **Tasas por canal** (`ChannelRateOfflineService`, `localStorage`, cifrado): un `method + currency` con `buyValue`, `sellValue` y `effectiveFrom`. Es el que usa la conversión de dinero real.

El primero es redundante, se autogenera **sin que nadie lo abra**, y su valor sí es correcto semánticamente (unidades de CUP por 1 USD), que es exactamente lo que `ChannelRate` guarda. El segundo ya está gateado por MultiMonedas y es el que manda.

## Decisiones tomadas (usuario)

- **Migración disparada por el click** en el menú **"Tasas de Cambio"**. Ese click es el que hace la migración y después vacía el registro diario.
- **Multiplicidad de la migración**: **una fila por cambio de valor**, no una por día. Se agrupan las rachas de días consecutivos con el mismo valor y se escribe una fila por racha, con `effectiveFrom` = el **primer día** de la racha. Se conserva el histórico sin inflarlo con una fila por día.
- **Rama sin MultiMonedas**: como "Tasas de Cambio" está gateado por `moduleIds: [EModules.MultiMonedas]` (`sidebar.tsx:30` lo oculta), esa rama no tiene click al que colgarse. El borrado ocurre en el hook de autenticación, en el mismo punto donde hoy corre `ensureExchangeRateDailyRecords` (`auth-store.ts:24`).
- **Alcance del retiro**: limpieza **total** — ruta, página, servicio, sync, i18n, test E2E y código muerto.
- **E2E**: autorizado explícitamente borrar **solo** `frontend-react/e2e/precache-split.spec.ts:104`. Ningún otro E2E se toca.

## Semántica del destino

```ts
ChannelRate {
  method: SalePaymentMethod.Efectivo  // 0
  currency: Currency.CUP               // 0
  buyValue: <valor del registro>
  sellValue: <valor del registro>       // idéntico, por decisión del usuario
  effectiveFrom: <primer día de la racha>
}
```

`Currency.CUP = 0` y `SalePaymentMethod.Efectivo = 0` (`packages/domain/src/enums/index.ts:126,147`). El valor del registro viejo es "cuántas unidades de CUP equivalen a 1 USD", que es la misma unidad de `ChannelRate`. La conversión no cambia de significado.

## Tareas

- [x] **T1** — Módulo de migración + borrado, con tests. RED primero.
- [x] **T2** — Conectar la migración al click de "Tasas de Cambio" (cliente, no loader).
- [x] **T3** — Reemplazar `ensureExchangeRateDailyRecords` en `auth-store.ts:24` por el borrado de la rama sin MultiMonedas.
- [x] **T4** — Borrado total: ruta, página, servicio, `shared/lib/exchange-rates`, sync export/import, claves i18n, entrada de menú.
- [x] **T5** — Tests que se rompen: `sidebar.test.tsx`, serializer de sync, tests del servicio y de la vista. Actualizar o borrar.
- [x] **T6** — E2E: borrar `precache-split.spec.ts:104`.
- [x] **T7** — Verificación: `pnpm typecheck`, `pnpm test`, `pnpm lint`.
- [x] **T8** — Borrar `ExchangeRate` y `ExchangeRateErrors` de `packages/domain`, incluido el barrel `src/index.ts`.
- [x] **T9** — Corregir el razonamiento obsoleto de `REGENERABLE_ENTITY_KEY_PREFIX` en `unlock-gate.ts`.

## Idempotencia

Sin clave nueva en `localStorage`. El registro diario deja de autogenerarse (T3 elimina su único disparador vivo), así que:

- Click con registro **vacío** → no hay nada que migrar, no hace nada.
- Click con registro **con datos** → migra y vacía.
- Segundo click → registro ya vacío → no hace nada.

La condición "el registro está vacío" **es** el marcador.

## Criterios de aceptación

- El menú no muestra "Cambio USD a MN" en ningún estado de módulos.
- Un store **con** MultiMonedas: tras hacer click en "Tasas de Cambio", el canal Efectivo CUP tiene filas con `buyValue === sellValue` y una fila por cada cambio de valor; el registro diario queda vacío.
- Un store **sin** MultiMonedas: tras autenticarse, el registro diario queda vacío y no vuelve a crecer.
- `/management/exchange-rates` ya no responde (ruta eliminada).
- El import de un backup viejo que traiga `exchange-rates.json` no falla: lo ignora.
- No se pierde historia: la suma de las rachas cubre todos los días del registro.
- `pnpm typecheck`, `pnpm test` y `pnpm lint` pasan.

## Fuera de alcance

- Backend, migraciones EF, cambios de API.
- Tocar `frontend/` (Angular legacy, congelado).
- Tocar cualquier E2E distinto de la línea 104 autorizada.

## Pendientes cerrados (T8–T9)

**T8 — modelo muerto fuera de `packages/domain`.** `ExchangeRate` (`models/exchange-rate.ts`) y `ExchangeRateErrors` (`errors/exchange-rate-errors.ts`) borrados, más su test `errors/__tests__/exchange-rate-errors.test.ts`. Las dos líneas del barrel (`src/index.ts:10,31`) eliminadas. Prueba de RED: cero `import { ExchangeRate }` / `import { ExchangeRateErrors }` en todo `frontend-react/`; los únicos matches restantes eran los propios archivos, el barrel y prosa. Referencia desactualizada corregida en `models/recipe.ts:9`.

`ParsedData.exchangeRates?: readonly unknown[]` **se queda** (`sync/lib/services/data-serializer-service.ts:197`). No es opcional por gusto: dos test files fuera de la superficie autorizada (`sync/routes/__tests__/import-partial-paths.test.ts`, `import-no-write.test.ts`) siguen poniendo `exchangeRates: []` en literales que se pasan a `synchronizer.sync(data)`, y el excess-property check de TypeScript lo vuelve error de compilación. Es además la costura que demuestra que un backup previo a la retiro se ignora en vez de rechazarse.

**T9 — razonamiento arreglado, comportamiento intacto.** El diff de `unlock-gate.ts` es **solo comentarios**: el prefijo (`línea 97`) y el `continue` (`línea 128`) quedan idénticos. **No se borró la constante, a propósito.** La exclusión sigue siendo load-bearing: un dispositivo que viene de un build anterior al retiro y nunca abrió "Tasas de Cambio" conserva el ciphertext `lizoft.store-exchangeRates-<storeId>` en `localStorage`, y tratar eso como evidencia reproduciría el lockout del 2026-09-06. El comentario nuevo dice exactamente eso y advierte explícitamente que no se borre el prefijo.

La cobertura **no existía** — no había ningún test de `hasUnreadableCiphertext`. Se agregaron 7 tests en `offline/__tests__/unlock-gate.test.ts`, incluido el guard de regresión (leftover `exchange-rates-s1` → `false`) y una fila de control (ciphertext de usuario normal → `true`). Mutation-checked: borrar la línea 128 rompe 2 de 19; el archivo fue restaurado byte a byte.

Verificación: `pnpm typecheck` PASS, `pnpm test` PASS (**5013** tests, +7 exactamente), `pnpm lint` PASS. Spot check del orquestador: `unlock-gate.test.ts` 19/19 PASS.

### Deuda cosmética restante (no tocada, fuera de superficie)

Siete archivos mencionan en comentarios los símbolos borrados, sin romper nada y con lint limpio: `packages/domain/src/errors/{recipe-errors,elaboration-errors,channel-rate-errors}.ts` citan `ExchangeRateErrors` como ejemplo de convención, y `inventory/lib/services/{warehouse-offline-service,recipe-offline-service}.ts`, `channel-rates/lib/services/channel-rate-offline-service.ts` y `sync/lib/services/data-synchronizer-service.ts:243` citan el `ExchangeRateOfflineService` borrado. Solo prosa.

## Progreso

T1–T7 cerradas. Rama `dev`, base `origin/dev`. Alcance real: **28 archivos, +168 / −1813**.

### Evidencia

| Tarea | Resultado |
|---|---|
| T1 | `management/channel-rates/lib/migrate-exchange-rates-to-channel-rates.ts` + 16 tests. RED observado antes de implementar (fallo de resolución del import), luego GREEN. |
| T2 | `channel-rates.tsx` — `useCallback` + `useEffect` cliente, **antes** de `load()`, nunca en el loader. |
| T3 | `auth-store.ts` — `ensureExchangeRates` → `resolveRetiredExchangeRates`, fire-and-forget. Los tres call sites actualizados (cold boot, login online, login offline). |
| T4 | 5 + 2 archivos borrados, ruta, menú, 12 claves i18n, wiring de sync (`export.tsx`, `import.tsx`, `EDataFileName.ExchangeRates`, `ExchangeRateImportService`, `mergeExchangeRatesViaService`). |
| T5 | `sidebar.test.tsx`, serializer y synchronizer tests actualizados; `__tests__` del código eliminado borrados. |
| T6 | Exactamente 1 línea borrada, verificado con `git diff`. |
| T7 | Ver abajo. |

Verificación (desde `frontend-react/`, salida real):

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | **PASS** — 5/5 tasks, sin `error TS`. |
| `pnpm test` | **PASS** — 341 archivos, **5006 tests**, sin errores de tipo. 3m39s. |
| `pnpm lint` | **PASS** — 4/4 tasks, `--max-warnings=0` limpio. |
| `pnpm vitest run …/migrate-exchange-rates-to-channel-rates.test.ts` | **PASS** — 16/16 (spot check del orquestador). |

**Playwright E2E: PENDIENTE.** No se ejecutó — requiere backend vivo y PostgreSQL.

### Hallazgos que exigen decisión aparte

1. **`ExchangeRate` y `ExchangeRateErrors` siguen en `packages/domain`.** Ya no tienen consumidores en código de aplicación; solo quedan vivos por los `export *` del barrel en `packages/domain/src/index.ts:10,31`, que **no estaba** en la superficie autorizada. Hacen falta autorización para ese archivo.
2. **`unlock-gate.ts:79-87` quedó obsoleto.** `REGENERABLE_ENTITY_KEY_PREFIX = 'lizoft.store-exchangeRates-'` afirma que el registro diario es la única entidad REGENERABLE. Eso ya es falso: nada lo regenera. Es inocuo en runtime y no rompe nada, pero es razonamiento muerto. `app/shared/lib/offline/**` tampoco estaba autorizado.
3. **`EXCHANGE_RATES_FIRST_LOGIN` y `'exchangeRates'` se conservan** a propósito: el módulo de migración los necesita para borrar. `'exchangeRates'` sigue en `BUSINESS_ENTITY_NAMES` para que `entity-migration`, `store-data-reset` y `damaged-data-recovery` sigan viendo una entrada legacy en un dispositivo actualizado.

### Comportamiento destructivo documentado

La rama `skipped-conflict` **borra el registro igual**. Si una tienda ya tenía filas Efectivo/CUP registradas a mano, esas filas mandan y no se intercala nada, pero el registro diario se pierde. Es la decisión del doc (paso 4d), no un descuido — conviene que sea consciente.

## Próximo paso

Esperar la verificación E2E y resolver los hallazgos 1 y 2 si querés el borrado completo del modelo de dominio.
