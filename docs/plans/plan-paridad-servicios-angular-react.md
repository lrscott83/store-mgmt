# Plan de revisión de paridad — Servicios Angular → React

> Documento de trabajo. Fuente de reglas: [`docs/migration/playbook-migracion-servicios-angular-react.md`](../migration/playbook-migracion-servicios-angular-react.md).
> Objetivo: revisar la paridad de CADA servicio Angular contra su contraparte React, uno a uno, en orden seguro.

## Principio rector

Angular es la ÚNICA fuente de verdad. La paridad de un servicio **no es confiable hasta que la de sus dependencias esté verificada**. Si auditamos un nodo alto y encontramos una divergencia, sin las dependencias verificadas no sabemos si el bug es del nodo o sube desde abajo.

## Estrategia de dos pasadas

1. **Pasada top-down (L6 → L0) — scoping, NO verificación.** Solo mapear call-sites y detectar problemas de la regla 10: métodos sin correlato, bypasses de orquestación, código muerto. Estos problemas *solo se ven desde arriba* (quién llama a quién).
2. **Pasada bottom-up (L0 → L6) — verificación real.** Método por método contra las 11 reglas, apoyándose en que todo lo de abajo ya está confirmado. Así cada divergencia es genuinamente del nodo auditado.

El cimiento es `base.service` + `BaseRepository`. Si la base no espeja Angular, todo lo que hereda arrastra el error.

## Las 11 reglas (referencia condensada)

1. Angular = única fuente de verdad. Nunca validar contra API/backend en vivo.
2. Migrar ≠ mejorar. Cualquier cambio de arquitectura/contrato/firma no forzado por la migración → se PREGUNTA, no se asume.
3. Paridad de firma en TODOS los métodos públicos (nombre, params, tipo envuelto). Única transformación: `Observable<T>` → `Promise<T>`.
4. Observable → Promise, async de los dos lados. Offline NUNCA se hace síncrono. Streams multi-emisión (BehaviorSubject) → se marcan, no se degradan a Promise.
5. DI según convención del repo React.
6. Migrar el repositorio si existe (mismas reglas; espejar estructura).
7. Migrar offline Y online si existen; espejar la orquestación (cómo decide offline vs online).
8. Bugs: consultar → TDD. Nunca replicar ni arreglar en silencio.
9. Contrato de errores exacto. Sin aplanar envelopes.
10. Call-sites: mismo uso lógico que Angular. Método React sin correlato Angular → reportar. Uso Angular sin correlato React → reportar.
11. Cualquier duda que fuerce una suposición → se pregunta.

---

## Grafo de dependencias (hojas → arriba)

DAG limpio, sin ciclos. `extends BaseService` cuenta como dependencia (una subclase no se migra antes que su base).

```
L0  base.service · storage.service · auth-http.service · auth-fake-http.service
    connection.service · loading.service · data.service · csv-product.service
    download-manager · global-error-handler · icon-setup · preloading
    store-module-state · update · currency.service · translation · splash-screen

L1  auth.service ...................... (auth-http + storage)
    product.service [abstract] ........ (extends base)
    product-category.service [abstract] (extends base)
    store · store-user · user · owner · reseller · usage · module · feature · message  (extends base)
    interceptor · loading-interceptor · connection-interceptor

L2  product-category.repository ....... (auth)
    authorization.service ............. (auth)
    store-usage-tracker ............... (auth)
    app-init .......................... (auth + icon-setup)
    error-interceptor ................. (auth)
    product-category-online ........... (product-category.service)
    product-online .................... (product.service)
    sale-credit-offline ............... (auth)
    expense-offline ................... (auth)

L3  product.repository ................ (product-category.repository + auth)

L4  product-category-offline .......... (product-category.repo + product.repo + product-category.service)
    product-offline ................... (product.repo + product-category.repo + product.service)
    inventory-offline ................. (product.repo + product-category.repo + authorization + auth)

L5  order-offline ..................... (product.repo + product-category.repo + inventory-offline + credits + expenses + authorization + auth)
    shopping-cart ..................... (product.service + inventory-offline)

L6  data-serializer ................... agrega casi todo el dominio
    data-synchronizer ................. agrega casi todo el dominio   ← lo último
```

## Clusters de dominio (orden de migración)

| Cluster | Hojas → arriba |
|---|---|
| **auth/user/store** | auth-http → storage → **auth** → authorization / store-usage-tracker; + store, store-user, user, owner, reseller, usage, module, feature |
| **categories** | product-category.service `[abs]` → repository → online → offline |
| **products** | product.service `[abs]` → repository → online → offline |
| **inventory** | inventory-offline (necesita products + categories + authorization) |
| **credits / expenses** | sale-credit-offline · expense-offline (solo auth — se pueden hacer temprano) |
| **orders/cart** | order-offline (el más pesado) · shopping-cart |
| **sync** | data-serializer · data-synchronizer — **el techo** |

## Camino crítico

`base.service` → `auth`/`storage` → los dos repositories → los tres offline (product/category/inventory) → order-offline → sync.

---

## Roadmap de ejecución (orden de tareas)

Ordenado bottom-up: cada grupo se resuelve por SDD + TDD estricto, y no se abre un grupo hasta que sus dependencias estén ✅. Los cimientos van primero porque todo hereda de ellos.

### Fase 0 — Cimientos (base compartida) ← PRIMERO

0.1 **`BaseRepository` — ELIMINAR (regla 12). ✅ HECHO** (SDD `eliminate-base-repository`, archive `c69019c`). Angular NO tiene clase base de repos. Se eliminó la abstracción React y se inlinó en cada repo que la hereda (product, category, inventory) los helpers de storage, **incluido el caché en memoria y el auto-init de localStorage al leer**. → habilita categories/products/inventory.

0.2 **`BaseService` — ✅ HECHO** (SDD `baseservice-parity`, archive `a612fb5`, verify PASS). **GIRO vs. la hipótesis original:** la hipótesis era "Angular SÍ tiene `_services/base.service.ts`, no se elimina, se espeja". Pero la verificación del source probó que la interface `BaseService<T>` de React (`packages/domain/src/services/base-service.ts`) **NO espejaba** a Angular — era una invención que conflacionaba el BaseService HTTP heredado-muerto + el `getStorageX()` per-service (sin base compartida en Angular). Por regla 12 → se ELIMINÓ (como BaseRepository). Los 4 offline exponen solo su `getStorageX()` fiel. NOTA: la paridad de la `_services/base.service.ts` REAL de Angular re-emerge cuando se migren los L1 online (store/user/owner/etc.) en Fase 1 — hoy no están migrados o dropearon el `extends`.

### Fase 1 — auth/user/store

storage.service · auth-http.service → **auth.service** → authorization.service · store-usage-tracker.service; + store · store-user · user · owner · reseller · usage · module · feature · message.

### Fase 2 — categories

product-category.service `[abs]` → product-category.repository *(resolver hallazgo regla 3: param `isActive`)* → product-category-online → product-category-offline.

### Fase 3 — products

product.service `[abs]` → product.repository *(resolver bypass de orquestación del sync/import + CONCERN de caché/auto-init ya cubiertos por Fase 0)* → product-online → product-offline.

### Fase 4 — inventory

**inventory-offline.service:** primero **mover/inline `InventoryRepository` a donde vive el offline-service** (regla 12 — Angular persiste inline, no hay repo), eliminando `remove`/`clear` muertos y los fixes silenciosos (`reviveEntry`, forzado de `[]`). Luego verificar paridad del offline contra Angular.

### Fase 5 — credits / expenses

sale-credit-offline · expense-offline. Solo dependen de `auth`, así que pueden adelantarse a la Fase 1 si conviene paralelizar.

### Fase 6 — orders / cart

order-offline (el más pesado) · shopping-cart.

### Fase 7 — sync (el techo)

data-serializer · data-synchronizer. Se hacen al final: agregan casi todo el dominio.

---

## Servicios infra/framework (FUERA de la fila de paridad de negocio)

Plumbing de Angular; varios ni tienen equivalente React. Revisar solo si aparece un correlato React.

`_interceptors/*` (connection, error, interceptor, loading) · `translation` (i18n) · `splash-screen` · `icon-setup` · `global-error-handler` · `loading` · `preloading` · `download-manager` · `update` · `data` (loader JSON) · `connection` · `app-init`

---

## Tabling de tracking — verificación bottom-up (L0 → L6)

Estado: ⬜ pendiente · 🔎 en revisión · ⚠️ hallazgos · ✅ paridad confirmada · ➖ N/A (sin correlato React)

| Nivel | Servicio Angular | Ruta Angular | Estado | Hallazgos |
|---|---|---|---|---|
| L0 | base.service | `_services/base.service.ts` | ✅ | Invención React `BaseService<T>` ELIMINADA (SDD baseservice-parity, `a612fb5`). Angular base.service real se audita cuando se migren L1 online. |
| L0 | storage.service | `_services/storage/storage.service.ts` | ⬜ | — |
| L0 | auth-http.service | `_services/auth/auth-http/auth-http.service.ts` | ⬜ | — |
| L0 | currency.service | `application/entries/currency.service.ts` | ⬜ | — |
| L0 | csv-product.service | `_services/csv/csv-product.service.ts` | ⬜ | — |
| L0 | store-module-state.service | `_services/shared/store-module-state.service.ts` | ⬜ | — |
| L1 | auth.service | `_services/auth/auth.service.ts` | ⬜ | — |
| L1 | product.service [abstract] | `domain/interfaces/product.service.ts` | ⬜ | — |
| L1 | product-category.service [abstract] | `application/categories/product-category.service.ts` | ⬜ | — |
| L1 | store.service | `_services/store/store.service.ts` | ⬜ | — |
| L1 | store-user.service | `_services/storeuser/store-user.service.ts` | ⬜ | — |
| L1 | user.service | `_services/user/user.service.ts` | ⬜ | — |
| L1 | owner.service | `_services/owner/owner.service.ts` | ⬜ | — |
| L1 | reseller.service | `_services/reseller/reseller.service.ts` | ⬜ | — |
| L1 | usage.service | `_services/usage/usage.service.ts` | ⬜ | — |
| L1 | module.service | `_services/module/module.service.ts` | ⬜ | — |
| L1 | feature.service | `_services/features/feature.service.ts` | ⬜ | — |
| L1 | message.service | `domain/interfaces/message.service.ts` | ⬜ | — |
| L2 | product-category.repository | `application/categories/product-category.repository.ts` | ⚠️ | Regla 3: `activate/deactivateProductCategory` perdieron el param `isActive` (código muerto ambos lados, no ratificado). Resto OK. |
| L2 | authorization.service | `_services/authorization/authorization.service.ts` | ⬜ | — |
| L2 | store-usage-tracker.service | `_services/usage-tracker/store-usage-tracker.service.ts` | ⬜ | — |
| L2 | product-category-online.service | `application/categories/product-category-online.service.ts` | ⬜ | — |
| L2 | product-online.service | `application/products/product-online.service.ts` | ⬜ | — |
| L2 | sale-credit-offline.service | `application/credits/sale-credit-offline.service.ts` | ⬜ | — |
| L2 | expense-offline.service | `application/expenses/expense-offline.service.ts` | ⬜ | — |
| L3 | product.repository | `application/products/product.repository.ts` | ⚠️ | Ver hallazgos de repos abajo. |
| L4 | product-category-offline.service | `application/categories/product-category-offline.service.ts` | ⬜ | — |
| L4 | product-offline.service | `application/products/product-offline.service.ts` | ⬜ | — |
| L4 | inventory-offline.service | `application/entries/inventory-offline.service.ts` | ⚠️ | React inventó `InventoryRepository` sin correlato Angular. Ver hallazgos de repos abajo. |
| L5 | order-offline.service | `application/orders/order-offline.service.ts` | ⬜ | — |
| L5 | shopping-cart.service | `_services/order/shopping-cart.service.ts` | ⬜ | — |
| L6 | data-serializer.service | `application/synchronization/data-serializer.service.ts` | ⬜ | — |
| L6 | data-synchronizer.service | `application/synchronization/data-synchronizer.service.ts` | ⬜ | — |

---

## Hallazgos ya confirmados — auditoría de REPOSITORIOS (2026-07-09)

Ninguno de los 3 repositorios React cumple al 100%. Detalle:

### `product-category-repository.ts` — el más sano
- **Regla 3 (CONCERN):** `activateProductCategory`/`deactivateProductCategory` perdieron el segundo param `isActive` que Angular declara. Código muerto en ambos lados, pero cambio de firma no ratificado.
- `addProductCategoryByName` (always-returns-id) espeja Angular correctamente — excepción ratificada (commits 42fcc7d, 2274ca8, engram #842). NO es hallazgo.

### `product-repository.ts` — bypass de orquestación
- **Regla 10 (VIOLACIÓN):** `updateImportedProduct`/`addImportedProduct`/`updateProducts` son ports 1:1 correctos pero SIN call-site real. El flujo sync/import esquiva `ProductRepository` y reimplementa un merge más débil contra `BaseRepository`: unicidad de nombre **global** (Angular la hace **por categoría**), sin chequeo de barcode ni de existencia de categoría.
- **Regla 2/4 (CONCERN):** `getStorageProductsMap` perdió el caché en memoria (Angular devuelve la misma referencia entre llamadas; React re-parsea localStorage cada vez).
- **Regla 9 (CONCERN):** `getProductsJson` en store vacío devuelve `null` en React vs `"[]"` en Angular (falta el auto-init de localStorage al leer).

### `inventory-repository.ts` — el más grave (estructural)
- **Regla 6 (VIOLACIÓN):** Angular NO tiene repository de inventory. Su persistencia vive inline dentro de `inventory-offline.service.ts`. React inventó una capa `InventoryRepository` que no espeja nada.
- **Regla 10 (VIOLACIÓN):** `remove` y `clear` sin correlato Angular Y sin call-site React — código muerto especulativo.
- **Regla 3:** `getByProductId` fuerza `[]`, Angular puede devolver `undefined`.
- **Regla 8 (CONCERN):** `reviveEntry` revive 3 fechas, Angular revive solo `date` — fix silencioso.
- **Regla 9 (CONCERN):** `getAll` no auto-inicializa localStorage al leer; Angular sí.

### Causa raíz sistémica
El `BaseRepository` compartido de React **no replica** dos comportamientos de Angular: el **caché en memoria** y el **auto-init de localStorage al leer**. De ahí salen los CONCERN de product y category. Decidir a nivel `BaseRepository` antes de tocar los repos.

---

## Decisiones pendientes (requieren consulta — reglas 2/8/11)

- [x] `BaseRepository`: ELIMINADO (regla 12) — SDD `eliminate-base-repository`, archive `c69019c`. Cada repo React reproduce inline los helpers de storage (caché + auto-init) como Angular.
- [x] `BaseService` (interface React): ELIMINADA (regla 12) — SDD `baseservice-parity`, archive `a612fb5`. No espejaba a Angular; era invención. Los 4 offline exponen solo su `getStorageX()`.
- [x] `InventoryRepository`: ELIMINADO/inlineado (reglas 6/12) — SDD `eliminate-inventory-repository`, archive `8dbc992`, verify PASS. Persistencia inline en InventoryOfflineService espejando Angular (cache + auto-init + reviveEntry date-only); export sync re-homed via `getInventoryEntriesJson`. Falta aún la VERIFICACIÓN de paridad del offline-service en sí (pasada bottom-up).
- [ ] `product` sync bypass: ¿se cablea el import/sync a través de `ProductRepository` para recuperar la validación por-categoría + barcode?
- [ ] `activate/deactivateProductCategory`: ¿se ratifica el drop del param `isActive` o se restaura?
