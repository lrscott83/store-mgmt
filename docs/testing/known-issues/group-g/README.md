# Grupo G — cerrado (2026-09-25)

Los dos flaky recurrentes de las corridas completas quedaron resueltos y sus fichas
se retiraron (patrón del repo: lo resuelto se elimina; el detalle queda en
`docs/testing/known-issues.md` y en el historial de commits):

- **`warehouses` — StoreUser sin Almacenes** (flaky en 4 de 6 corridas): el test estaba
  **duplicado** por `create-store-user.spec.ts` ("StoreUser en /management/users/create es
  deslogueado") — mismo flujo línea por línea. Retirado con autorización del usuario; el
  gating del menú de Almacenes sigue pineado por el test anterior del mismo spec.
- **`store-switch-back-logout` SSR-1** (flaky en 2 de 6 corridas): el setup podía avanzar con
  el nombre de la tienda **vacío** → `storeRow('')` generaba una regex vacía que casaba con
  TODOS los botones (strict mode violation). Endurecido con reintentos acotados del refresh
  de sesión y fallo ruidoso si el nombre no llega; el timeout x2 temporal (360 s) se retiró —
  la causa nunca fue el tiempo.
