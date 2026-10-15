# Conteo de productos — vista independiente, solo visual

Feature: **conteo-productos**. Branch: `qa`. Delivery: `ask-on-risk`.
Runner: `pnpm --filter @store-mgmt/web-store-pos test` (vitest) + `pnpm --filter @store-mgmt/web-store-pos typecheck`.

Objetivo: una vista **nueva e independiente** de conteo de productos, **solo visual** (no
persiste ni ajusta stock), con buscador, productos agrupados por categoría en paneles
colapsables y un botón **Limpiar** que borra todos los conteos y deja la vista en cero.

## Specs

- **S1** — Es una **vista distinta** de `/inventory/available`: `"Lo del conteo es otra vista
  distinta a disponible y que sea solo de conteo."` El conteo **no** vive dentro de Disponible.
- **S2** — `"Solo visual"`: no persiste nada (ni `localStorage`, ni backend) y no ajusta el
  stock. Los conteos viven solo mientras la pantalla está montada.
- **S3** — Botón **Limpiar**: `"que tenga un boton de limpiar para quitar todos los conteos y
  volver a empezar"`.
- **S4** — Productos **agrupados por categorías** en **paneles colapsables**: `"Solo visual
  agrupados por categorias los productos en los paneles colapsables como en las otras vistas
  que tenemos"`.
- **S5** — Buscador de producto por nombre (`"Buscar producto por nombre…"`, según la referencia).
- **S6** — Cada producto muestra: número de fila, nombre, `"Sistema: N uds"`, la etiqueta
  `"Conteo"` con su campo editable, y la **diferencia**.
- **S7** — La diferencia se resalta: negativa con signo `-` en rojo; cero o positiva en verde
  con signo `+`.
- **S8** — Título de la vista `"Conteo de productos"` con el número de productos.
- **S9** — La vista se alcanza desde el menú (grupo INVENTARIO), con la misma autorización que
  Disponible (`EFeatures.Available`).

## Assumptions (marcadas, corregibles)

- **A1** — Ruta `/inventory/count` y entrada de menú `"Conteo de productos"` justo debajo de
  `"Disponible"` (la captura 20 del manual de referencia no define ubicación).
- **A2** — La diferencia es `contada − sistema`, la misma fórmula que ya existía.
- **A3** — Sin conteo escrito, la diferencia se muestra como `—` (neutra).
- **A4** — Se conservan los estilos del POS (tema claro), no los del mockup oscuro de la

  imagen: mismos componentes y clases que las otras vistas.

## Tasks

| ID | S# | Ruta | Estado | Evidencia |
|----|----|------|--------|-----------|
| T1 | S1 | inline | done | conteo embebido quitado de `inventory-product-list.tsx` (+ sus tests y claves i18n) restaurando `0dfb3418^`; diff = −135/+19, exactamente el inverso de `0dfb3418` |
| T2 | S2,S6,S7 | inline | done | `app/inventory/components/product-count-list.tsx` (+ `countDifference` pura) |
| T3 | S3 | inline | done | botón `Limpiar` en el header de la vista (`count.tsx`, `data-testid="product-count-clear"`) |
| T4 | S4,S5,S8 | inline | done | `app/inventory/routes/count.tsx` |
| T5 | S9 | inline | done | `routes.ts` (`inventory/count`), `menu-config.ts` (debajo de Disponible), `es.ts` |
| T6 | todas | inline | done | `product-count-list.test.tsx` (11), `routes/__tests__/count.test.tsx` (3) — ver L5 |

## Log

- **L1 (2026-10-15, verbatim)** — `"la idea es tener una vista como esta [imagen] y que todo sea
  visual, y que tenga un boton de limpiar para quitar todos los conteos y volver a empezar. Solo
  visual agrupados por categorias los productos en los paneles colapsables como en las otras
  vistas que tenemos"`
- **L2 (2026-10-15, verbatim)** — `"Lo del conteo es otra vista distinta a disponible y que sea
  solo de conteo. Yo queria una vista con los detalles que di y no esta asi."`
- **L3 (contexto)** — En `docs/plans/imagenes-manual-referencia-pos.md` la captura 20 ("Auditoría
  en curso: lista con cantidad del sistema, la contada y la diferencia resaltada") sigue marcada
  como ❌ no existente. El commit `0dfb3418` había metido un conteo **visual** dentro de
  `/inventory/available` sin feature document ni spec del owner; este documento repara eso y lo
  mueve a su vista propia.
- **L4 (evidencia, implementación)** — Archivos:
  - NUEVOS: `app/inventory/components/product-count-list.tsx`, `app/inventory/routes/count.tsx`,
    `app/inventory/components/__tests__/product-count-list.test.tsx`,
    `app/inventory/routes/__tests__/count.test.tsx`.
  - MODIFICADOS: `app/routes.ts`, `app/shared/lib/config/menu-config.ts`,
    `app/shared/lib/i18n/es.ts`, y (limpieza T1) `inventory-product-list.tsx` +
    `inventory-components.test.tsx` + `es.ts`.
  - `docs/plans/imagenes-manual-referencia-pos.md`: la captura 20 pasa a ✅ (13 claras, 2 sin
    equivalente: 3 y 25).
- **L5 (evidencia, checks)** — `typecheck` OK; `lint --max-warnings=0` OK; suite completa
  `388 archivos / 5639 passed, 6 skipped`, 0 errores de tipo. Tests nuevos: 11 + 3 = **14**.
  No se tocó ningún E2E (ni `frontend-react/e2e/` ni `backend/src/SMCA.WebApi.E2ETests/`).
- **L6 (riesgo)** — `Risk: none` — vista NUEVA (no rompe nada: ruta y entrada de menú son aditivas) más
  el retiro de un añadido de un día antes que nunca se pidió. La vista nueva queda cubierta por 14
  tests; `inventory-product-list.tsx` conserva el resto de su cobertura y la suite completa está
  verde. No toca datos persistidos (solo estado de pantalla), ni seguridad, ni contratos
  existentes, ni concurrencia, ni entrega.
- **L7 (pendiente)** — Sin commit todavía: la rama sigue con los cambios en el árbol a la espera
  de la decisión del owner.
