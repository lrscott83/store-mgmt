# catalogo-web-columnas-movil

## Objetivo

En la configuración de Catálogo Web (`/sales/web-catalog`, OwnerAdmin, módulo 18) el dueño puede
elegir **cuántos elementos por fila muestra la rejilla de productos en MÓVIL**: **1 o 2**. Se
persiste por tienda y lo pinta el catálogo público.

Aplica **SOLO a la plantilla `default`**. La plantilla `boutique` queda **fuera de alcance** y no
cambia (decisión del owner, 2026-10-12).

- Rama: `feat/catalogo-web-columnas-movil` (desde `dev`).
- Entrega: `single-pr` (feature pequeña; sin cadena). Push/PR = decisión del owner.
- Runner: backend `dotnet test`; frontend `pnpm vitest run` + `pnpm typecheck` + `pnpm lint`.

## Specs

S1. Pedido original del owner (verbatim, 2026-10-12):
> "en la configuracion de catalogo web para las tiendas que lo tiene habilitado poder seleccionar
> si 1 o 2 elementos por fila en modo mobile"

S2. Alcance (verbatim, 2026-10-12):
> "vamos a hacer el cambio a default, dejaremos a boutique fuera del alcance de esto"

S3. El dueño puede seleccionar **1** o **2** en la configuración de Catálogo Web y el valor se
persiste por tienda (una fila por tienda, D7).

S4. El catálogo público, plantilla `default`, usa ese valor para las columnas de la rejilla **en
móvil** (viewport < `sm`): `1` → una columna; `2` → dos columnas. Desde `sm` el comportamiento no
cambia (2 columnas) y en `lg` sigue en 3.

S5. Una tienda sin fila, o con el valor en blanco/fuera de rango, se pinta con **2** (comportamiento
actual). Ninguna tienda `default` existente cambia de aspecto al migrar.

S6. La plantilla `boutique` NO cambia.

S7. Valores permitidos: solo `1` y `2`. Cualquier otro valor se rechaza con 400 al guardar.

S8. No se tocan E2E (ni backend ni frontend) ni sus support files. Sin tests E2E nuevos.

## Decisiones

| # | Punto | Decisión | Motivo |
| --- | --- | --- | --- |
| D1 | Alcance de plantilla | Solo `default` | Decisión del owner (S2). `boutique` tiene diseño propio de 1 columna. |
| D2 | Dónde vive el control | Config de Catálogo Web del dueño (`/sales/web-catalog`, sección "Marca") | "configuracion de catalogo web ... para las tiendas que lo tiene habilitado" (S1); la vista está gateada por módulo 18 + OwnerAdmin. |
| D3 | Columna | `StoreCatalogSettings.MobileColumns` (int, NOT NULL, default 2) | Misma fila que la marca/config del catálogo (D19). Paleta/plantilla viven ahí; `PaletteId` está muerto y no se reutiliza. |
| D4 | Escritura/lectura | Se extiende el endpoint de marca del Owner (`GET|PUT /v1/catalog/branding`) | Es la config de catálogo del dueño y ya carga en la vista; el PUT ya es parcial ("lo que no viaja no se toca"). Evita endpoints nuevos. |
| D5 | Normalización pública | El config anónimo publica `mobileColumns`, normalizado a 1 o 2 (default 2) | El storefront siempre tiene que poder pintar; una fila rota no debe romper el catálogo. |
| D6 | Rejilla | `default-catalog.tsx`: `grid-cols-1` (1) / `grid-cols-2` (2) en móvil; `lg:grid-cols-3` intacto | Solo afecta la base móvil; `sm`/`lg` no cambian (S4). |

## Tareas

- [x] **T1** — Backend: `StoreCatalogSettings.MobileColumns` + config EF (NOT NULL, default 2) + `DefaultMobileColumns`.
- [x] **T2** — Backend: migración EF + script generado + fila en `scripts/README.md` + aplicar a `smca_test`.
- [x] **T3** — Backend: `MobileColumns` en `StoreCatalogBrandingDto` (lectura dueño) y en `PublicOrderingConfigDto` (lectura pública) + mapeo/defaults en las dos queries.
- [x] **T4** — Backend: escritura parcial en `UpdateStoreCatalogBrandingCommand` + campo de formulario en `CatalogBrandingController` + regla del validador (1..2; "nada que hacer" incluye mobileColumns).
- [x] **T5** — Backend: tests (branding query/validator/handler; public config).
- [x] **T6** — Frontend: tipos/servicio (`mobileColumns` en `CatalogBranding`, `CatalogBrandingUpdate`, `PublicOrderingConfig`; `FormData`).
- [x] **T7** — Frontend: control 1/2 en la sección "Marca" de `web-catalog.tsx` (estado, dirty, payload).
- [x] **T8** — Frontend: `default-catalog.tsx` usa `mobileColumns` para la rejilla móvil.
- [x] **T9** — Frontend: i18n (`es.ts`) + tests (default-catalog, web-catalog, servicio).
- [x] **T10** — Verificación (build/tests backend, `typecheck`/`lint`/`vitest`).

## Criterios de aceptación

1. El dueño elige 1 o 2 en Catálogo Web y se persiste por tienda (S3).
2. El catálogo público `default` muestra 1 o 2 columnas en móvil según el valor; `sm`=2 y `lg`=3 sin cambios (S4).
3. Sin fila, o valor inválido en la fila, se pinta con 2 (S5).
4. `boutique` idéntica (S6).
5. Un valor distinto de 1/2 se rechaza con 400 (S7).
6. Tests verdes; E2E sin cambios (S8).

## Comandos de verificación

```bash
cd backend
dotnet build src/SMCA.sln
dotnet test src/Application.Tests/Application.Tests.csproj

cd ../frontend-react/apps/web-store-pos
pnpm typecheck
pnpm lint
pnpm vitest run app/catalog/ app/sales/
```

## Log

L1 (verbatim, 2026-10-12):
> "actualiza esta rama local dev con los cambios de la rama remota test, no hagas verificacion post
> merge y luego quiero que en la configuracion de catalogo web para las tiendas que lo tiene
> habilitado poder seleccionar si 1 o 2 elementos por fila en modo mobile"

L2 (verbatim, 2026-10-12):
> "vamos a hacer el cambio a default, dejaremos a boutique fuera del alcance de esto"

- Merge `dev` ← `origin/test`: fast-forward `eac38545..f1cae8e5` (18 commits). Sin verificación post-merge (pedido explícito).
- Feature creado tras exploración. Sin implementación todavía.
- Implementado inline (ruta direct inline; sin razón de escritor delegado). `default` solo; `boutique` intacta (comportamiento por defecto sin cambio).
- Evidencia:
  - `dotnet build src/SMCA.sln`: 0 errores.
  - `dotnet test Application.Tests`: **1250 passed** (0 failed).
  - Migración `20261012143222_Add-StoreCatalogSettings-MobileColumns`: `defaultValue: 2` verificado en el `Up()`; aplicada a `smca_test`; script `33-...sql` generado desde la migración (`-From 20261009182159_Add-StoreCatalogSettings-TemplateId`, sin `-To`) + idempotencia (`DO $$ IF NOT EXISTS` + `ON CONFLICT DO NOTHING`).
  - E2E de config con la migración aplicada de verdad (WebAppFixture): `OrderingSettingsRouteAuthE2ETests` + `PublicOrdering*` → **17 passed**.
  - Frontend: `pnpm typecheck` 0; `pnpm lint` 0; `pnpm vitest run app/catalog/ app/sales/` → **85 archivos / 1765 tests** verdes.
- Riesgo: item 1 (migración) — cambio de esquema persistido. Verificación independiente pendiente/decidida por el flujo.
- Verificación independiente (subagente `gentle-ai-verify`, read-only, sobre `f1cae8e5..HEAD`):
  - `dotnet build`: 0 errores; `Application.Tests`: **1250 passed**; E2E config (`OrderingSettingsRouteAuthE2ETests` + `PublicOrdering*`): **17 passed** (31.7 s, `[E2E Guard] Database=smca_test`); `pnpm typecheck`/`lint` 0; `vitest app/catalog app/sales`: **1765 passed**.
  - Verdicts: **S3 PASS, S4 PASS, S5 PASS, S7 PASS**; S6 (`boutique` intacta) y S8 (E2E sin tocar) PASS. **Sin blockers.**
  - Columna en vivo: `MobileColumns | integer | NOT NULL | default 2`; historial con la migración.
  - Advisories (no bloqueantes, no requieren corrección):
    1. Pre-existente: el helper de reset E2E (`DbTestHelpers.cs`) no borra `StoreCatalogSettings`, así que un run abortado deja residuo y rompe los siguientes (FK 23503). No es regresión de este cambio.
    2. Crash del testhost en el primer intento E2E, no reproducido en el reintento (17/17).
  - S7 por HTTP real no se ejercitó (S8 prohíbe E2E nuevos); probado por unit + cadena de middleware ya cubierta.
  - Sondas de regresión propuestas por el verificador: no se añaden — duplican los casos 0/3/-1 ya cubiertos por los tests del validador (disciplina del repo: "no añadir otros casos"). El texto de la sonda llegó parcialmente corrupto, así que no se commitea.
- RDD (`gentle-ai review mode status` = on): `review assess --base-ref f1cae8e5 --committed-only` → `risk: medium`, **`review_due: false`** (`under_budget`) → **no abre revisión nativa**.
- Pendiente: push/PR = decisión del owner.
