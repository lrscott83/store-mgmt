# 6. web-catalog:77 — el toast esperado lo reemplazó el nuevo guardado por lotes de qa

**Qué prueba el test.**
`web-catalog.spec.ts:77` (catálogo público completo): crear producto en el POS,
sincronizar, subirle imagen desde el editor del catálogo web y verlo publicado en
`/catalog/<slug>`. En la línea 136-137 el spec pulsa el botón **"Guardar"** del editor y
espera el toast **`Producto guardado en el catálogo`** (`WEB_CATALOG.SAVED`).

**Qué falla (en simple).**
El clic funciona, pero el toast que aparece es otro: el merge de qa reemplazó el guardado
por producto con un **guardado por lotes de un solo botón** que muestra
`Se guardó 1 producto en el catálogo` (`WEB_CATALOG.SAVED_CHANGES_ONE`). El texto que
espera el test ya no existe en ese flujo → `expect(getByText('Producto guardado en el
catálogo')).toBeVisible()` → `element(s) not found` (timeout 5 s), 3 veces.

**Causa raíz (confirmada — cambio de UX intencional de qa).**
- El commit de qa `bb7967ce` "feat(web-catalog): editable description and single batch
  save button" (traído por el merge `eca8b499`) rediseñó el guardado en
  `web-catalog.tsx` (+249 líneas):
  - **Nuevo flujo:** botón único `data-testid="catalog-save-all-button"` con label
    `WEB_CATALOG.SAVE_CHANGES` = **"Guardar cambios"** (líneas 570-580) →
    `handleSaveChanges()` (línea 333) → toast `SAVED_CHANGES_ONE`/'Se guardó 1 producto
    en el catálogo' (líneas 369-373).
  - **Flujo viejo:** `handleSaveProduct()` (línea 379) aún muestra `SAVED`
    ('Producto guardado en el catálogo'), pero ya **no tiene botón propio** — solo lo
    dispara `onSetMainImage` con una clave existente (línea 543), un camino que el test
    no recorre.
- El test clickea `getByRole('button', { name: 'Guardar' })`; Playwright matchea por
  **sustring**, así que resuelve al botón batch "Guardar cambios" (el único con "Guardar"
  en el nombre) → corre el flujo nuevo → toast nuevo.
- El resto del flujo (imagen aplicada, publicación, catálogo público) no llegó a
  evaluarse: el test se cae en el toast.

**Evidencia (2026-10-01).**
1. Corrida completa: failed.
2. Spec aislado `pnpm test:e2e e2e/web-catalog.spec.ts --workers=1`: **failed 3/3
   intentos** — determinista.
3. Lectura de código: `today-orders` no, pero en `web-catalog.tsx` los dos handlers y
   sus toasts (líneas 369-373 vs 389) más el label del botón batch (`SAVE_CHANGES` en
   `es.ts`) explican el mensaje observado.

**Estado de la causa raíz:** confirmada con diff de qa + lectura de código + repro 3/3.

**Propuesta de solución (pendiente de autorización — no se aplicó nada).**
Actualizar el spec al flujo nuevo: esperar `Se guardó 1 producto en el catálogo`
(`SAVED_CHANGES_ONE`) tras pulsar "Guardar cambios" — o, si se prefiere conservar la
prueba del toast viejo, clickear el camino que aún lo dispara. Cambio de 1-2 líneas en un
test E2E: requiere autorización explícita 1 a 1 (regla de la sesión). **No se tocó nada.**
Ojo: este spec lo reescribí en `78f3d804` y pasaba — el reescrito es anterior al merge
`eca8b499`; el fallo es del merge, no del rewrite.
