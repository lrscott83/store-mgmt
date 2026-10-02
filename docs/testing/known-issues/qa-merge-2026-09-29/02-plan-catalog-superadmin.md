# 2. plan-catalog-superadmin — el popup de planes no abre

**Estado: ✅ RESUELTO 2026-09-30** (mismo defecto que la ficha 1; ver su causa raíz completa).

**Qué prueba el test.**
El SuperAdmin abre el catálogo de planes y debe ver un popup con los cuatro paneles de
planes, incluyendo VIP.

**Qué fallaba.**
El botón de acciones de la tienda no aparecía — la pantalla de tiendas no cargaba datos.
Mismo síntoma que la ficha 1, distinto test.

**Corrección importante.** La versión anterior de esta ficha decía que *"si se arregla la
carga de la lista de tiendas, ambos deberían pasar"*. La inferencia era correcta, pero la
descripción de la causa era falsa: **no era la lista de tiendas ni el backend**. El módulo
de ruta `/app/admin/stores/routes/store-list.tsx` fallaba al **cargar**, por un `SyntaxError`
de importación:

```
SyntaxError: The requested module '/node_modules/.vite/deps/@store-mgmt_domain.js?v=e29ca23a'
  does not provide an export named 'NO_PLAN_GROUP'
```

React Router lo reportaba como `No result returned from dataStrategy for route
admin/stores/routes/store-list`. Causa raíz completa y cadena de build en
[`01-store-module-pricing.md`](01-store-module-pricing.md) y
[`07-vite-dep-cache-stale.md`](07-vite-dep-cache-stale.md).

## Evidencia de la resolución

Re-corrido tras borrar `apps/web-store-pos/node_modules/.vite`, **sin modificar el spec**:

```
✓ PCF1 — the popup shows the four plan panels including VIP (3.0s)
✓ PCF2 — Superior lists "Múltiples monedas" and "Elaboración";
         VIP lists its exclusive "Múltiples pagos" (1.9s)

2 passed (36.9s)
[e2e teardown] 58 filas e2e-* borradas en "smca_test"
```

> **Nota sobre una afirmación previa.** El README de esta carpeta y una nota de
> known-issues daban este spec por verde. Mientras el defecto sistémico estuvo vivo **fallaba
> con el mismo error**. Si vuelve a aparecer "sin que nadie haya tocado nada", sospechá del
> caché de Vite primero, no del spec.
