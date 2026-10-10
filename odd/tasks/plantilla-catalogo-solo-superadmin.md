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

- [ ] **T1** — Backend: DTO `StoreCatalogTemplateDto` + query `GetStoreCatalogTemplateQuery` (SuperAdmin).
- [ ] **T2** — Backend: command `UpdateStoreCatalogTemplateCommand` + validator (kebab) + handler (upsert solo TemplateId).
- [ ] **T3** — Backend: endpoints en `StoresController` (`{storeId}/catalog-template`).
- [ ] **T4** — Backend: quitar `TemplateId` de la marca (DTO/command/controller/validador) + ajustar tests.
- [ ] **T5** — Backend: tests del nuevo query/command/validator.
- [ ] **T6** — Frontend: `store-http-service` (get/update template).
- [ ] **T7** — Frontend: modal + acción en `/admin/stores` (store-list + store-card-list).
- [ ] **T8** — Frontend: quitar selector de `web-catalog.tsx` + tipos/servicio + tests.
- [ ] **T9** — Frontend: i18n + tests.
- [ ] **T10** — Verificación (build/tests backend, typecheck/lint/vitest).

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
