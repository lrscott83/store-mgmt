# menu-catalogo-web-group

## Objetivo
Reorganizar el menú lateral: sacar del grupo **VENTA** todo lo relacionado con el catálogo web y
crear un grupo propio **CATÁLOGO WEB** debajo de Venta, visible cuando la tienda tenga habilitado
el módulo **Catálogo Web (18)**, con los ítems de configuración y de gestión de pedidos.

## Problema
Hoy los ítems de catálogo web y pedidos WhatsApp/Gestión viven dentro del grupo VENTA, mezclados
con la venta del día a día. Se quiere agruparlos por módulo y que cada sub-bloque aparezca solo si
la tienda tiene su módulo.

## Alcance
- Archivo: `frontend-react/apps/web-store-pos/app/shared/lib/config/menu-config.ts`
- i18n: `frontend-react/apps/web-store-pos/app/shared/lib/i18n/es.ts`
- Tests: `frontend-react/apps/web-store-pos/app/shared/components/__tests__/sidebar.test.tsx` (añadir describe nuevo)
- **NO** se tocan rutas (`routes.ts`) ni guards de loader. Los endpoints siguen exigiendo
  módulo 18 (`WebCatalogAdmin`) en el backend.
- **NO** se toca `frontend/` (Angular, legacy) ni la suite E2E (`frontend-react/e2e/`).

## Diseño acordado
Nuevo grupo, insertado **después** del grupo VENTA y antes de INVENTARIO:

- `groupLabel: 'MENU.WEB_CATALOG_GROUP'` → "CATÁLOGO WEB"
- `moduleId: EModules.WebCatalog` (metadato; el sidebar no filtra por grupo, ver hallazgo)

Ítems (en orden):
1. `MENU.WEB_CATALOG_SETTINGS` = "Configuración" → `/sales/web-catalog`
   - gate: `featureIds:[WebCatalog]`, `moduleIds:[WebCatalog]`, `rolesOnly: OwnerAdmin`
2. `MENU.ONLINE_ORDERS_SETTINGS` = "Pedidos WhatsApp" → `/sales/online-orders/settings`
   - gate: `featureIds:[WebCatalog]`, `moduleIds:[PedidosWhatsApp]` (módulo 19), `rolesOnly: OwnerAdmin`
3. `MENU.ONLINE_ORDERS` = "Pedidos" → `/sales/online-orders` (módulo 20)
4. `MENU.ONLINE_ORDERS_DRIVERS` = "Repartidores" → `/sales/online-orders/drivers` (módulo 20)
5. `MENU.ONLINE_ORDERS_SALES` = "Ventas" → `/sales/online-orders/sales` (módulo 20)

Los 5 ítems se **eliminan** del grupo VENTA. El resto del grupo VENTA no cambia.

### Gating (hallazgo del mapeo)
`MenuGroup.moduleId` está **muerto**: `sidebar.tsx` solo filtra ítems (`item.moduleIds`) y luego
oculta grupos vacíos. Por eso la visibilidad del grupo se logra con el gate de los ítems: como
"Configuración" exige el módulo 18, el grupo aparece cuando la tienda tiene el Catálogo Web. No se
añade gating por grupo (filtrar por `group.moduleId` rompería ADMIN/SALES/INVENTORY para SuperAdmin,
cuyo `storeModuleIds` está vacío).

### Divergencia menú/ruta en Pedidos WhatsApp (intencional)
La RUTA y el backend de `/sales/online-orders/settings` exigen módulo 18 + WebCatalogAdmin. El ítem
del menú se gatea por módulo 19 (pedido del usuario). No hay divergencia práctica: el backfill y el
catálogo de planes hacen que 19 implique 18. Por eso el `featureIds` del ítem sigue siendo
`WebCatalog` (122): es lo que el endpoint realmente exige. No se introduce la feature 124 en el
frontend.

## Tareas
- [x] T1. Añadir i18n: `MENU.WEB_CATALOG_GROUP` y `MENU.WEB_CATALOG_SETTINGS`; retirar `MENU.WEB_CATALOG` (queda sin uso).
- [x] T2. Crear el grupo CATÁLOGO WEB en `menu-config.ts` y mover los 5 ítems desde VENTA.
- [x] T3. Añadir tests en `sidebar.test.tsx` (grupo, gates por módulo 18/19/20, placement tras VENTA).
- [x] T4. Correr test de sidebar + typecheck; registrar evidencia.

## Criterios de aceptación
- El grupo CATÁLOGO WEB aparece después de VENTA y antes de INVENTARIO.
- "Configuración" apunta a `/sales/web-catalog`; "Pedidos WhatsApp" a `/sales/online-orders/settings`.
- "Pedidos WhatsApp" solo con módulo 19; los ítems de gestión solo con módulo 20.
- Los ítems ya no están en VENTA.
- `sidebar.test.tsx` verde; typecheck verde.
- No se rompe ningún test existente.

## Delivery
- Estrategia: `ask-on-risk` (default). Cambio pequeño (< ~400 líneas autoradas).
- Commits: 1 work-unit commit (Conventional Commit) en la rama actual `test`.

## Evidencia / bitácora
- Implementado en 3 archivos: `menu-config.ts`, `i18n/es.ts`, `sidebar.test.tsx`. Ruta: delegated direct (escritor acotado).
- Tests: `pnpm --filter @store-mgmt/web-store-pos test -- app/shared/components/__tests__/sidebar.test.tsx` → 60/60 verde.
- Suite completa: `pnpm --filter @store-mgmt/web-store-pos test` → 372 archivos / 5508 tests verdes, sin type errors.
- `pnpm typecheck` (raíz `frontend-react`, turbo) → 5/5 tareas OK.
- **Hallazgo de entorno (no del cambio):** `@store-mgmt/domain` se resuelve por `packages/domain/dist`; si el `dist` está obsoleto, `pnpm --filter … typecheck`/`test` (que saltan `^build` de turbo) fallan con `TS2339` para `EModules.GestionPedidos`/`PedidosWhatsApp` y los gates por módulo pasan en falso. Correr siempre desde la raíz con `pnpm typecheck`/`pnpm test` (turbo) o reconstruir domain.
- **Review RDD (gentle-ai, lineage `review-f17bdd69f8468ff1`):** riesgo medio, lens `review-reliability` → **approved** + `acknowledge-approved` (authority burned). 4 hallazgos informativos, ninguno abre corrección:
  - R3-001 (WARNING): el ítem "Pedidos WhatsApp" gatea por módulo 19 pero ruta/backend exigen 18; el supuesto "19 ⇒ 18" no lo prueba el candidato. Mitigado por el backfill/planes (19 se crea solo sobre el universo del 18), pero es un supuesto.
  - R3-002 (WARNING): el test "solo con módulo 19" siembra 18+19; no cubre el borde 19-sin-18.
  - R3-003 (SUGGESTION): el test "sin módulo 18" no asserta que el grupo esté oculto.
  - R3-004 (SUGGESTION): el test de placement no asserta que el grupo precede a INVENTARIO.
- Pendiente: decisión del usuario sobre commit/entrega (la entrega es humana, no la ejecuta el flujo ODD).
