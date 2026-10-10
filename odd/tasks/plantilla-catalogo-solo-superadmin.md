# Plantilla del catálogo — solo SuperAdmin

## Objetivo

La **plantilla (vista) del catálogo público** de una tienda pasa a fijarla **solo el SuperAdmin**,
por tienda, desde `/admin/stores`. Se **retira** del lado Owner (configuración del Catálogo Web).

## Problema / motivo

La plantilla se implementó en la config del Catálogo Web (`/sales/web-catalog`, `WebCatalogAdmin` /
OwnerAdmin). El owner decidió (2026-10-10) que **solo el SuperAdmin** puede cambiarla: es una
decisión de plataforma, no de la tienda. Hay que mover la escritura a un endpoint SuperAdmin por
tienda (`StoresController`, como `{storeId}/module-pricing`) y quitar el control del Owner.

## Alcance

### Autorizado

- **Backend**:
  - Nuevos endpoints **SuperAdmin**: `GET|PUT /api/v1/stores/{storeId}/catalog-template`
    (`[HasPermission(StoreRoleFeatures.SuperAdmin)]` + guard `IsSuperAdmin` en el handler, como el
    pricing). El PUT escribe **solo** `StoreCatalogSettings.TemplateId` (upsert de la fila por
    tienda; crea si falta con defaults).
  - **Quitar** `TemplateId` de la marca del Owner: `StoreCatalogBrandingDto`,
    `UpdateStoreCatalogBrandingCommand` (param + escritura + respuesta), `CatalogBrandingController`
    (campo de formulario) y su regla de validación. El `TemplateId` sigue en el config **público**
    (`PublicOrderingConfigDto`) porque el storefront lo necesita para pintar.
- **UI React**:
  - Quitar el selector de plantilla de `sales/routes/web-catalog.tsx` y su estado/tipos/servicio.
  - Añadir en `/admin/stores`, **por tienda**, una acción + modal "Plantilla del catálogo"
    (SuperAdmin), siguiendo el patrón de `StoreModulePricingModal` (modal presentacional + estado en
    `store-list.tsx`).
  - Servicio `store-http-service.ts`: `getStoreCatalogTemplate(storeId)` /
    `updateStoreCatalogTemplate(storeId, templateId)`.
  - i18n y tests.

### Fuera de alcance

- No se toca el render público (sigue leyendo `templateId` del config anónimo).
- No se toca el POS. No se crean features/módulos nuevos.
- Angular `frontend/` no se lee.

## Decisiones

| # | Punto | Decisión |
| --- | --- | --- |
| S1 | Quién | Solo **SuperAdmin** (gate por tienda). Owner retirado; StoreUser nunca pudo. |
| S2 | Dónde (UI) | `/admin/stores`, por tienda (acción propia junto a "Module Pricing"). |
| S3 | Endpoint | `GET|PUT /v1/stores/{storeId}/catalog-template` en `StoresController`, patrón module-pricing. |
| S4 | Persistencia | La misma columna `StoreCatalogSettings.TemplateId`; el endpoint crea la fila si falta. |
| S5 | Owner | Se quita el control y la escritura del PUT de marca (el DTO de marca deja de llevar `TemplateId`). |

## Tareas

- [x] **T1** — Backend: DTO `StoreCatalogTemplateDto` + query `GetStoreCatalogTemplateQuery` (SuperAdmin).
- [x] **T2** — Backend: command `UpdateStoreCatalogTemplateCommand` + validator (kebab) + handler (upsert solo TemplateId).
- [x] **T3** — Backend: endpoints en `StoresController` (`{storeId}/catalog-template`).
- [x] **T4** — Backend: quitar `TemplateId` de la marca (DTO/command/controller/validador) + ajustar tests.
- [x] **T5** — Backend: tests del nuevo query/command/validator.
- [x] **T6** — Frontend: `store-http-service` (get/update template).
- [x] **T7** — Frontend: modal + acción en `/admin/stores` (store-list + store-card-list).
- [x] **T8** — Frontend: quitar selector de `web-catalog.tsx` + tipos/servicio + tests.
- [x] **T9** — Frontend: i18n + tests.
- [x] **T10** — Verificación (build/tests backend, typecheck/lint/vitest).

## Progreso

- 2026-10-10 — **Implementado y entregado** en la rama `qa`.
  - Backend `4bd…` — commit `feat(stores): SuperAdmin-only per-store catalog template endpoint`.
    `dotnet build src/SMCA.sln` 0 errores; `dotnet test Application.Tests` **1176 passed**.
  - Frontend — commit `feat(stores): SuperAdmin selector for a store's catalog template`.
    `pnpm typecheck` 0, `pnpm lint` 0; `app/sales` **1561 passed**; `app/management/stores` +
    `app/admin/stores` + `app/catalog` verdes.
  - Se quitó `WEB_CATALOG.BRAND_TEMPLATE*` (del Owner); el selector del SuperAdmin reusa
    `WEB_CATALOG.TEMPLATE_DEFAULT`/`TEMPLATE_BOUTIQUE` vía `CATALOG_TEMPLATES`.
- 2026-10-10 — **RDD cerrada y APROBADA (autoridad quemada)**. Lineage `review-590812242852cd0d`.
  - `gentle-ai review acknowledge-approved` → `action: acknowledged`, `authority: burned`.
  - **Advisories NO bloqueantes** (trabajo posterior, nunca motivo para re-revisar este candidato):
    - `R3-1` (WARNING): el modal del SuperAdmin **no** repite el *fallback* de version skew que tenía
      el selector del Owner (un `templateId` guardado que este build no lista → `select` sin opción
      válida). Regresión de cobertura al mover el selector.
    - `R3-2` (WARNING): si la carga de la plantilla falla, `templateValue` queda en `default` y el
      guardado se rehabilita → un admin podría **guardar `default` sobre la plantilla real**.
    - `R3-3`/`R3-4`/`R3-5` (SUGGESTION): tests más semánticos; falta test de la acción del
      card-list (gating por `isActive`); falta test a nivel de controller/routing/atributo.
  - **Cerrados `R3-1`, `R3-2` y `R3-4`** en el commit `1e6cf322`: el modal cae a `default` con un
    id desconocido (version skew), el guardado queda bloqueado si la carga falló, y hay tests del
    modal (ambos casos) y del gating de la acción del card-list. Quedan `R3-3` (tests más
    semánticos) y `R3-5` (test de controller) como trabajo posterior.

## Criterios de aceptación

1. El SuperAdmin fija la plantilla de una tienda en `/admin/stores` y se persiste.
2. El Owner **no** tiene control de plantilla en Catálogo Web.
3. El storefront sigue pintando la plantilla guardada (config público intacto).
4. Un `templateId` desconocido cae a `default` (sin cambios).

## Verificación

```bash
cd backend && dotnet build src/SMCA.sln && dotnet test src/Application.Tests/Application.Tests.csproj
cd frontend-react/apps/web-store-pos && pnpm typecheck && pnpm lint && pnpm vitest run app/admin/stores app/catalog app/sales
```
