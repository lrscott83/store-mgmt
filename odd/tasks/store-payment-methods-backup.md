# Feature: store-payment-methods-backup

**Objetivo:** `storePaymentMethods` (config de métodos de pago por tienda, key `lizoft.store-storePaymentMethods-<storeId>`) se exporta e importa en el backup ZIP, replicando el patrón de `channelRates`.

**Problema:** hoy la config de métodos de pago es local por dispositivo y no viaja en el backup; un restore en otro dispositivo pierde la configuración. `channelRates` ya se exporta/importa (multipayments T4); `storePaymentMethods` es el único gap real.

**Por qué:** decisión del usuario (2026-09-23): añadirlo, con semántica preservada de "ausente = default".

**Alcance autorizado (usuario: "Añadirlo al backup (Recomendado)"):**
- Nueva entrada `store-payment-methods.json` en el ZIP v2.
- **Semántica:** backup viejo (sin entrada) → NO tocar config local; backup nuevo (con entrada) → sobrescribir.
- NO se sube `V2_FORMAT_VERSION` (entrada aditiva, patrón documentado ExchangeRates/Warehouses/ChannelRates/Recipes/Elaborations).

**Restricciones:**
- `frontend/` (Angular) es legacy, NO se toca.
- NO modificar E2E existentes. Solo React (`frontend-react/`).
- `channelRates` NO se toca (ya funciona).

## Tasks

### T1 — Seam de lectura raw + EDataFileName + export/parse (serializer + service)
- `store-payment-methods-config-service.ts`: exponer lectura pública SIN auto-init (ausente → `null`), p. ej. `getStoredConfig(storeId?): StorePaymentMethodsConfig | null` reutilizando `getConfigFromLocalStorage` (que ya devuelve null si no existe); y `setConfigFromBackup(config, storeId?)` que escribe con `encryptEntity` (evitar auto-init).
- `data-serializer-service.ts`:
  - `EDataFileName.StorePaymentMethods = 'store-payment-methods.json'`
  - `StorePaymentMethodsReader` (interface, devuelve config `| null`)
  - `ParsedData.storePaymentMethods?: StorePaymentMethodsConfig` (OPCIONAL, como recipes/elaborations, para no romper literales de tests existentes)
  - `export()`: escribir la entrada SOLO si el reader devuelve config (no-null); no escribir si ausente
  - `parseContents()`: poblar el campo SOLO si la entrada existe en el ZIP
  - `exportPlainData()`: incluirlo igual (parse → objeto)

### T2 — Merge en el synchronizer
- `data-synchronizer-service.ts`:
  - `StorePaymentMethodsImportService` (interface): `setImportedStorePaymentMethods(config): Result`
  - Parámetro opcional en constructor (legacy call sites omiten → no-op)
  - Merge step: si `data.storePaymentMethods` es `undefined` → no-op (no tocar); si existe → sobrescribir vía service; agregar al `SyncResult` con contador/outcome consistente con los demás merges.

### T3 — Wiring rutas
- `import.tsx`: construir `StorePaymentMethodsConfigService(storeId)`; pasarlo al `DataSerializerService` y al `DataSynchronizerService`.
- `export.tsx`: construir el service en AMBOS handlers (`handleExport` y `handleExportPlain`); pasarlo al serializer.

### T4 — Tests
- Round-trip serializer: backup con config → import devuelve el config; backup viejo (sin entrada) → campo `undefined`.
- Synchronizer: config presente → sobrescribe; ausente → no toca (no-op).
- Service: `getStoredConfig` no auto-inicializa cuando la key no existe; `setConfigFromBackup` persiste cifrado.
- Verificación: `pnpm typecheck` + tests afectados pasan.

## Criterios de aceptación
- Export con store configurado → ZIP contiene `store-payment-methods.json` cifrada.
- Export sin config → ZIP NO contiene la entrada.
- Import de ZIP con entrada → sobrescribe config local de esa tienda.
- Import de ZIP sin entrada → config local intacta.
- Backups nuevos en app vieja → entrada ignorada (compatibilidad).
- Checks: `pnpm typecheck`; tests de serializer, synchronizer, payment-methods service.

## Estado
- [x] T0 Exploración y decisión (2026-09-23)
- [x] T1 · [x] T2 · [x] T3 · [x] T4

## TDD
Modo efectivo: no configurado explícitamente en el proyecto/sesión (desconocido) → checks funcionales ordinarios. Runner: vitest v3 (`vitest run <pattern>` en `apps/web-store-pos`). Evidencia: 54 tests en serializer + synchronizer, suite completa del service, eslint `--max-warnings=0` limpio.

## RDD (work-unit 9c984521)
- `gentle-ai review assess --base-ref 4e187368 --committed-only --json` → `review_due: true` (`high_risk`, motivo `unassessable`: runtime OpenCode no elegible para review inmutables).
- Preflight STATUS (`gentle-ai.review-integration/v2 --agent opencode`) → `failure/v2` `immutable_review_transport_unsupported`, `next_action: stop`, `retry_safe: false`.
- Resultado por task: **unavailable** (limitación del runtime cliente; no es defecto de Gentle AI → sin handoff). El boundary revisado NO avanza (sigue en 4e187368). No se deshabilitó RDD; sigue on (global). Un review en runtime elegible (claude-code/codex) queda pendiente si el usuario lo decide.

## Progreso / evidencia
- T1 (2026-09-23): `store-payment-methods-config-service.ts` — añadidos `getStorageStorePaymentMethods` (lectura sin auto-init, satisface `StorePaymentMethodsReader`), `setConfigFromBackup` (escritura cifrada sin auto-init) y `setImportedStorePaymentMethods` (seam de import que devuelve `Result`). `data-serializer-service.ts` — `EDataFileName.StorePaymentMethods = 'store-payment-methods.json'`, entrada escrita SOLO si el reader devuelve config no-null; `parseContents` deja el campo `undefined` si la entrada no existe; `exportPlainData` lo incluye parseado o `undefined`.
- T2 (2026-09-23): `data-synchronizer-service.ts` — `StorePaymentMethodsImportService` (opcional en constructor), merge de sobrescritura total; `undefined` en el batch → no-op verdadero (ni siquiera se registra outcome).
- T3 (2026-09-23): `import.tsx` y `export.tsx` (ambos handlers) pasan `new StorePaymentMethodsConfigService(storeId)` a serializer y synchronizer.
- T4 (2026-09-23): tests nuevos/actualizados — serializer (T9 describe: round-trip con config, sin config → sin entrada, legacy v1 → undefined, corrupt → CorruptFileError, exportPlainData), synchronizer (`data-synchronizer-store-payment-methods.test.ts`, 5 tests), service (seams de backup). Verificación: `pnpm typecheck` (solo errores preexistentes ajenos), tests de serializer/synchronizer/payment-methods verdes, `eslint` limpio.