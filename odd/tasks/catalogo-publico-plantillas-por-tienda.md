# Catálogo público — plantillas (vistas) por tienda

## Objetivo

Permitir que cada tienda publique su catálogo público (`/catalog/{slug}`) con **una vista
(plantilla) distinta**, sin duplicar funcionalidad: los datos, la búsqueda, el carrito, el checkout y
la consulta de estado son **comunes**; lo único que cambia es **cómo se pinta** (UI). Por defecto una
tienda usa la plantilla **actual** (el catálogo que ya existe), y la plantilla se **asocia a la
tienda** en su configuración de catálogo (OwnerAdmin).

## Problema

Hoy la página pública es **un solo componente** (`app/catalog/routes/public-catalog.tsx`, ~796 líneas)
con todo el layout inline: header fijo, carrusel, navegación, buscador, grilla, paginación y modal.
Todas las tiendas se ven **idénticas** salvo logo/banner. No existe ningún concepto de plantilla,
tema ni layout por tienda en backend ni frontend.

## Por qué

- Un catálogo con la **identidad visual de la tienda** da confianza al cliente anónimo que va a pedir
  por WhatsApp y diferencia a cada negocio.
- Separar **contenedor (funcionalidad)** de **plantilla (vista)** es el patrón
  container/presentational: el estado, la carga de datos y las acciones viven una sola vez; las
  plantillas solo reciben props y pintan.
- La plantilla debe ser un **dato por tienda** (`TemplateId`), igual que `LogoKey`/`BannerKey`, y
  viajar por el config público anónimo que ya existe.
- `PaletteId` ya existe end-to-end pero está **muerto** (paletas canceladas 2026-10-07): NO se
  reutiliza para esto. Los colores y la vista son conceptos distintos.

## Alcance

### Autorizado

- **Backend** (módulo Catálogo Web, sin módulo ni feature nuevos):
  - Columna `TemplateId` (`string`, por defecto `"default"`, max 64, requerida) en
    `StoreCatalogSettings`.
  - **Migración EF + script 31** (reglas de `AGENTS.md`: la migración es la fuente, el `.sql` se
    **genera** con `dotnet ef migrations script`).
  - Exponer `TemplateId` en `StoreCatalogBrandingDto` (lectura OwnerAdmin) y en
    `PublicOrderingConfigDto` (lectura anónima), con default `"default"` cuando la fila falta o está
    en blanco.
  - Escribir `TemplateId` desde `UpdateStoreCatalogBrandingCommand` como parte **parcial**: un valor
    ausente (`null`) = no se toca. El command de marca sigue sin tocar columnas de pedidos ni
    `PaletteId`.
- **UI React** (`frontend-react/`):
  - **Refactor container/presentational** de `public-catalog.tsx`: el contenedor conserva TODO el
    estado, la carga de datos y los handlers; las **overlays compartidas** (modal de detalle, carrito,
    checkout, estado del pedido) siguen en el contenedor. La **vista** (header, buscador, filtro de
    categoría, grilla, paginación, showcase) se extrae a una plantilla.
  - Plantilla `default` = la vista **actual**, movida tal cual (mismo DOM/testids) para no romper
    tests unitarios ni E2E.
  - **Plantilla nueva `boutique`**: mismas superficies funcionales, disposición y estilo distintos.
  - Registro de plantillas (`templateId → componente`) con **fallback a `default`** ante id ausente o
    desconocido.
  - Selector de plantilla en la sección "Marca" de `sales/routes/web-catalog.tsx` (OwnerAdmin).
  - Tipos/servicio (`templateId` en `PublicOrderingConfig`, `CatalogBranding`,
    `CatalogBrandingUpdate`; `FormData` de `updateBranding`).
  - i18n y tests unitarios nuevos.

### Fuera de alcance

- **No** se toca el comportamiento del catálogo web existente (queries públicas, `SyncCatalogCommand`,
  campos e imágenes) más allá de la columna nueva.
- **No** se reutiliza ni escribe `PaletteId` (sigue muerto).
- **No** se crean módulo ni feature nuevos: sigue bajo `WebCatalogAdmin` (OwnerAdmin).
- **No** se permite plantilla libre por CSS del dueño: son plantillas **predefinidas** (un id).
- **No** se toca el POS (D14) ni el carrito del POS.
- Angular `frontend/` **no se lee ni se cita** (legacy congelado).

## Restricciones (no negociables)

- **E2E intocable**: no se modifican tests E2E ni sus support files. La plantilla `default` debe
  renderizar **igual** que hoy.
- **Backend**: para esta feature se modifica código de producción (autorizado por el owner al pedirla;
  la regla de "solo añadir E2E" aplica al trabajo de cobertura, no aquí).
- **Migración/script**: la migración es la fuente; el `.sql` se **genera**, nunca se escribe a mano.
- **Angular como evidencia**: prohibido.

## Diseño técnico

### Contrato de props del contenedor → plantilla

El contenedor (`public-catalog.tsx`) mantiene: `catalog`, `page`, `state`, `listFailed`, `search`,
`categorySlug`, `currentPage`, `orderingConfig`, estado del carrito (store propio por slug) y el
estado de las overlays (detalle, carrito, checkout, estado). Pasa a la plantilla un objeto
`CatalogTemplateProps`:

- Identidad: `storeSlug`, `catalog`, `staffMode`, `templateId`.
- Marca/showcase: `logoUrl`, `carouselImages`, `dailyImages`, `orderingEnabled`.
- Lista: `page`, `total`, `totalPages`, `searchInput`, `onSearchInputChange`, `categorySlug`,
  `onCategoryChange`, `currentPage`, `onPageChange`, `listFailed`.
- Acciones: `onOpenDetail(product)`, `onAddToCart(product)`, `cartCount`, `onOpenCart`.

Las **overlays** (detalle/carrito/checkout/estado) las pinta el **contenedor**, no la plantilla:
misma funcionalidad en todas las vistas. Las plantillas solo pintan la página navegable.

### Registro de plantillas

`app/catalog/templates/registry.ts`: mapa `Record<string, ComponentType<CatalogTemplateProps>>` con
`default` y `boutique`, más `resolveTemplate(templateId)` que cae a `default` si el id falta o no
existe.

### Plantilla `boutique` (nueva)

Concepto: **vitrina de tienda** —hero de marca centrado (logo + nombre + horario/zonas), filtro de
categorías como **chips** horizontales, buscador destacado, grilla con tarjetas de precio
protagonista, y el **showcase (carrusel + imágenes del día) reinterpretado** (no eliminado) para
mantener la paridad funcional. Sin el header-fijo con anclas ni el botón flotante "Ver Productos" del
`default`. Todas las acciones (buscar, filtrar, paginar, ver detalle, agregar al carrito) funcionan
igual.

### Backend — migración

```bash
cd backend
dotnet ef migrations add Add-StoreCatalogSettings-TemplateId --project src/Infrastructure --startup-project src/SMCA.WebApi
# Up() de una migración de columna con default: revisar que el default sea 'default' y NOT NULL.
dotnet ef database update --project src/Infrastructure --startup-project src/SMCA.WebApi --connection "Host=localhost;Database=smca_test;Username=postgres;Password=postgres"
# Single new migration → -From la PREVIA (20261008021950_Add-StoreCatalogImages) y sin -To.
dotnet ef migrations script 20261008021950_Add-StoreCatalogImages --project src/Infrastructure --startup-project src/SMCA.WebApi -o scripts/31-20261009-Add-StoreCatalogSettings-TemplateId.sql
# + ON CONFLICT ("MigrationId") DO NOTHING, header, SELECTs de verificación, fila en scripts/README.md
```

## Decisiones

| # | Punto | Decisión | Motivo |
| --- | --- | --- | --- |
| P1 | Mecanismo | **Plantilla por tienda** (id predefinido), elegible por el OwnerAdmin en la config del catálogo | Respuesta del owner (2026-10-09): selector + 1 diseño nuevo; por defecto el actual |
| P2 | Columna | `TemplateId` **nueva** (no reutilizar `PaletteId`) | Semántica distinta; `PaletteId` está muerto (paletas canceladas) |
| P3 | Dónde viaja | `PublicOrderingConfigDto` (lectura anónima) + `StoreCatalogBrandingDto` (lectura dueño) | Es donde ya viaja la marca del catálogo |
| P4 | Escritura | `UpdateStoreCatalogBrandingCommand` **parcial** (`null` = no tocar) | Consistente con el PUT parcial de logo/banner |
| P5 | Validación backend | Formato/longitud (no whitelist de ids) | El frontend cae a `default` con id desconocido; evita acoplar backend a plantillas |
| P6 | Paridad | Overlays compartidas en el contenedor; plantillas solo pintan la vista | "Funcionalidad común, cambia la vista" |
| P7 | Default | `default` = vista actual movida sin cambios | No romper tests unitarios ni E2E |

## Tareas

- [x] **T1** — Backend: propiedad `TemplateId` en `StoreCatalogSettings` + config EF (max 64, required, default `default`).
- [x] **T2** — Backend: migración EF + script 31 generado + fila en `scripts/README.md` + aplicar a `smca_test`.
- [x] **T3** — Backend: `TemplateId` en `StoreCatalogBrandingDto` y `PublicOrderingConfigDto`; mapear y default en `GetStoreCatalogBrandingQuery` y `GetPublicOrderingConfigQuery`.
- [x] **T4** — Backend: escribir `TemplateId` (parcial) en `UpdateStoreCatalogBrandingCommand` + `CatalogBrandingController` (campo de formulario) + validación de formato.
- [x] **T5** — Backend: tests (query/command/validator; revisar test por reflexión de columnas).
- [x] **T6** — Frontend: tipos y servicio (`templateId` en 3 interfaces + `FormData`).
- [x] **T7** — Frontend: refactor container/presentational de `public-catalog.tsx` con plantilla `default` movida sin cambios (mismo DOM/testids).
- [x] **T8** — Frontend: plantilla `boutique` nueva.
- [x] **T9** — Frontend: `registry.ts` + `resolveTemplate` con fallback.
- [x] **T10** — Frontend: selector de plantilla en la sección "Marca" de `web-catalog.tsx`.
- [x] **T11** — Frontend: claves i18n.
- [x] **T12** — Frontend: tests unitarios (plantillas, resolver, selector, servicio).
- [x] **T13** — Verificación (build/tests backend, `typecheck`/`lint`/`vitest`).

## Criterios de aceptación

1. Una tienda con `TemplateId = "default"` (o sin fila) ve el catálogo **idéntico** a hoy.
2. Una tienda con `TemplateId = "boutique"` ve la vista nueva, con **todas** las funciones (buscar,
   filtrar, paginar, detalle, agregar al carrito, checkout, estado del pedido).
3. El OwnerAdmin puede elegir la plantilla en la config del catálogo y se persiste por tienda.
4. Un id desconocido cae a `default` sin romper la página.
5. La escritura de plantilla no pisa logo/banner/pedidos ni `PaletteId`.
6. Tests unitarios existentes del catálogo siguen verdes; E2E sin cambios.

## Comandos de verificación

```bash
cd backend
dotnet build src/SMCA.sln
dotnet test src/Application.Tests/Application.Tests.csproj

cd ../frontend-react/apps/web-store-pos
pnpm typecheck
pnpm lint
pnpm vitest run app/catalog/ app/sales/routes/__tests__/
```

## Entrega

- Rama de feature: `feat/catalogo-publico-plantillas-por-tienda` (desde `qa`).
- Pronóstico de líneas autoradas: **~1100** (supera el presupuesto de ~400). Estrategia:
  **feature-branch-chain** con slices: (A) backend T1–T5; (B) frontend mecanismo + refactor default
  T6/T7; (C) plantilla nueva + selector T8–T12. Fronteras exactas se fijan al commitear cada slice.

## Progreso

- 2026-10-09 — Feature creado tras exploración; decisión del owner: selector de plantilla + 1 diseño
  nuevo. Sin implementación.
- 2026-10-09 — **Slice A (backend T1–T5) implementado y verificado**, commit `a0303551` (rama
  `feat/catalogo-publico-plantillas-por-tienda`). Documento `802ca41d`.
  - `dotnet build src/SMCA.sln`: 0 errores.
  - `dotnet test Application.Tests`: **1175 passed** (+21).
  - Migración `20261009182159_Add-StoreCatalogSettings-TemplateId` aplicada a `smca_test`;
    `Up()` C# probado de verdad (borrar columna + historia → `database update` la re-crea).
  - Script `31-20261009-...sql` generado desde la migración (`-From`
    `20261008021950_Add-StoreCatalogImages`, sin `-To`); idempotente (ejecutado 2×).
  - Nota: la numeración de scripts saltó a 31 porque el 30 ya existía
    (`30-20261008-Add-StoreCatalogImages.sql`).
- 2026-10-09 — **Slice B/C (frontend T6–T13) implementado y verificado.**
  - `58ea65c9` — mecanismo de plantillas (contenedor + `default` movido sin cambios + `boutique`
    + registro con fallback), tipos/servicio, i18n y tests.
  - `0b99f265` — selector de plantilla en la sección "Marca" de `web-catalog.tsx` + tests.
  - `pnpm typecheck`: 0 errores.
  - `pnpm lint`: 0 errores.
  - `pnpm vitest run app/sales/`: **1566 passed** (76 archivos); los nuevos (registro, boutique,
    selección en el contenedor, FormData del servicio, selector en web-catalog) verdes.
  - El DOM de la plantilla `default` es idéntico: los tests preexistentes del catálogo público
    (`public-catalog.test.tsx`) siguen verdes sin cambios de comportamiento.
  - **Pendiente**: revisión nativa (RDD) y, si el owner quiere, PRs encadenados. Push y PR son
    decisión del owner.
- 2026-10-09 — **Revisión nativa (RDD) intentada y bloqueada por el harness** (owner decidió
  dejarla atrás y continuar). Diagnóstico con evidencia dura:
  - Candidato completo (38 archivos / 5910 líneas): `lens_context_budget_exceeded` — el
    `Designer.cs` autogenerado por EF pesa 3332 líneas y revienta el presupuesto del revisor.
  - Candidato frontend reducido (lineage `review-c1c4fa2555c8f6e6`, lente `review-reliability`):
    el revisor **sí produjo** el JSON correcto (`inspection.status=completed`, `subject_hash`
    coincide), pero la **admisión lo rechaza**:
    `proof_path_out_of_scope / unknown_or_malformed_repository_path` sobre `R3-001`. El prompt del
    agente revisor **exige** probar con prefijo `changed-hunk:`, y la admisión resuelve esos refs
    como rutas → contradicción instrucciones↔admisión (fallo de Gentle AI, no del cambio).
    El transporte OpenCode lo surface como `opencode_review_transport_relay_refused (output_refused)`.
  - Sin aprobación creada. Rama y tests intactos.
- 2026-10-09 — **Cierre del hallazgo del revisor** (aunque RDD no lo pueda admitir): commit
  `b1c5f43b` añade 6 tests a `boutique-catalog.test.tsx` (lista fallida, catálogo vacío vs búsqueda
  sin resultados, conteo singular/plural, paginación anterior/siguiente y una sola página).
  `pnpm typecheck` 0, `pnpm lint` 0, boutique 14/14.
- 2026-10-10 — **RDD cerrada y APROBADA (autoridad quemada)**. Lineage `review-c1c4fa2555c8f6e6`.
  - El revisor admitió un artefacto (una corrida usó solo `candidate-created-path:`; el prefijo
    `changed-hunk:` es el que la admisión rechaza, y varía por corrida) y **encontró un bug real**:
    `R3-TEMPLATE-PROTO` (CRITICAL, determinístico): `resolveTemplate` devolvía claves heredadas de
    `Object.prototype` (`constructor`, `__proto__`, …) en vez de la plantilla por defecto → crash.
  - **Corregido**: `Object.hasOwn` + 5 tests de regresión (RED observado con el bug, luego verde).
    Commit `da8272b0`, pusheado a `qa` (`3532d4f7..da8272b0`).
  - El validador dirigido falló con `binding_mismatch` hasta reintentar con un binding **fresco tras
    el commit**; entonces pasó y la revisión cerró en `approved`.
  - `gentle-ai review acknowledge-approved` → `action: acknowledged`, `authority: burned`.
  - **Advisories NO bloqueantes** (trabajo posterior, nunca motivo para re-revisar este candidato):
    - `R3-REGISTRY-TAUTOLOGY` (WARNING): el test "cada id anunciado resuelve a un componente" usa
      `toBeDefined()`, que es tautológico.
    - `R3-SELECT-VERSION-SKEW` (SUGGESTION): el selector del dueño puede recibir un `templateId`
      que este build no lista (version skew) y quedar sin opción válida.
