# 1. store-module-pricing — el menú de engranaje no abre el modal

**Estado: ✅ RESUELTO 2026-09-30** (era un defecto del entorno de dev, no de la app ni del test).

**Qué prueba el test.**
Desde la lista de tiendas del SuperAdmin, tocar el engranaje de una tienda debe abrir
un modal que muestra el nombre de la tienda y su propio universo de módulos (qué módulos
tiene activos, cuáles no).

**Qué fallaba.**
El botón de engranaje de la tienda nunca aparece en pantalla. La pantalla de tiendas
queda en la página de Error con el texto:

```
Error: No result returned from dataStrategy for route admin/stores/routes/store-list
```

El test moría en `expect(gear).toBeVisible()` esperando un botón que no existía.

---

## Causa raíz — CONFIRMADA 2026-09-30

> **Corrección importante.** La versión anterior de esta ficha decía que *"el backend no
> devuelve resultado para la ruta que lista las tiendas"*. **Eso era falso.** El backend
> responds 200 y el `:5019` estaba sano. La ruta nunca llegó a pedirle nada al backend.

**El módulo de la ruta no cargaba.** El error real solo aparece en la consola del
navegador, nunca en la UI:

```
Error loading route module `/app/admin/stores/routes/store-list.tsx`, reloading page...
SyntaxError: The requested module '/node_modules/.vite/deps/@store-mgmt_domain.js?v=e29ca23a'
  does not provide an export named 'NO_PLAN_GROUP'
```

React Router convierte ese `SyntaxError` de importación dinámica en su error genérico
*"No result returned from dataStrategy"* y lo muestra en el error boundary. Por eso la
pantalla no dice nada de la causa real. **El `resellerLoader` nunca llegó a ejecutarse.**

### La cadena completa

| # | Eslabón | Estado |
|---|---------|--------|
| 1 | `packages/domain/src/commons/plan-module-groups.ts:8` define y exporta `NO_PLAN_GROUP = ''` | ✅ presente (modificado 2026-09-29 15:27) |
| 2 | `pnpm dev` → `turbo run dev` → `dependsOn: ["^build"]` (`turbo.json:24-28`) recompila `packages/domain/dist/` | ✅ `dist/commons/plan-module-groups.js` contiene el export (dist modificado 15:56, **después** del src) |
| 3 | `vite.config.ts:222-224` fuerza `optimizeDeps.include: ['@store-mgmt/domain']` → Vite pre-empaqueta el paquete en un **caché** | ⚠️ el caché se generó el **2026-09-28 10:20**, un día antes del cambio |
| 4 | El caché `apps/web-store-pos/node_modules/.vite/deps/@store-mgmt_domain.js` se sirve en vez de `dist/` | ❌ **0 ocurrencias** de `NO_PLAN_GROUP` |
| 5 | Cualquier ruta que importe ese símbolo desde `@store-mgmt/domain` revienta al cargar | ❌ `SyntaxError` |

**El punto que importa:** Vite decide cuándo re-empaquetar una dependencia mirando su
metadato (`package.json`) y el lockfile — **no** el contenido de su `dist/`. Un paquete del
workspace enlazado, recompilado correctamente por turbo, sigue siendo servido desde el
caché viejo. Nada en la cadena de build avisa: el build está "bien", el test solo no
encuentra un símbolo.

## Resolución aplicada (2026-09-30)

Se borró el caché de dependencias optimizadas y se reinició el dev server. **Cero cambios
en la app y cero cambios en los tests.**

```powershell
Remove-Item apps\web-store-pos\node_modules\.vite -Recurse -Force
```

## Evidencia de la resolución

`store-module-pricing.spec.ts` re-corrido contra el backend real (`:5019`, `smca_test`),
**sin ninguna modificación a los archivos del spec ni del fixture**:

```
✓ SMP1 — the gear menu opens the modal with the store name and its own module universe (2.9s)
✓ SMP2 — the table is grouped by plan, every module in exactly one group (2.1s)
✓ SMP3 — the three price inputs are disabled while the row is unticked (2.7s)
✓ SMP4 — the total recomputes live in the browser, and cancels without saving (2.9s)
✓ SMP5 — the control is SuperAdmin-only: an owner is refused, and the API answers 403 (1.6s)
✓ SMP6 — ticking a module the store has no row for inserts it and survives a reload (4.0s)
✓ SMP7 — a saved price edit survives a reload (3.3s)
✓ SMP8 — the browser total equals the server total, percent before discount, clamped at zero (2.7s)

8 passed (1.2m)
[e2e teardown] 117 filas e2e-* borradas en "smca_test"
```

## Lo que este fallo revela sobre otros specs

**`e2e/admin-routes.spec.ts` estaba pasando por la razón equivocada.** Mientras este
defecto estuvo vivo, ese spec daba verde. Sus aserciones solo son:

- el pathname **no** es `/login`, y
- el body matchea `/\w+/`.

Una página de error cumple las dos. Ese spec nunca demostró que un SuperAdmin puede cargar
`/admin/stores`; solo demostró que el error boundary no nos manda al login. **No usarlo
como referencia de "el SuperAdmin carga la lista de tiendas"** — la referencia correcta es
`plan-catalog-superadmin.spec.ts`, que sí interactúa con la lista.

> **Pendiente de decisión:** reinforcing `admin-routes.spec.ts` para que deje de pasar en
> falso es tocar un test E2E existente, y los tests E2E existentes son intocables sin
> autorización explícita del usuario. Ver la ficha del defecto sistémico
> [`07-vite-dep-cache-stale.md`](07-vite-dep-cache-stale.md).
