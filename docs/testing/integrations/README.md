# Tests de integración — clasificación de los E2E por feature

> Análisis de **todos los specs E2E del frontend** (`frontend-react/e2e/*.spec.ts`, 106 archivos)
> para decidir qué se puede probar con un **test de integración** (solo servicios y repositorios:
> sin render, sin navegador y sin backend) y qué no.
>
> **Regla del proyecto:** los specs E2E existentes **no se tocan** sin autorización explícita del
> usuario. Este análisis no modifica ni debilita ningún test.
>
> Las que se pueden probar **completas** se implementan en
> `frontend-react/apps/web-store-pos/app/integrations/` (hoy: `multipayments` T10.2).

## Cómo leer cada carpeta

Una carpeta por feature, un archivo por feature. Dentro, una tabla con **una entrada por test**:

| Columna | Qué significa |
|---|---|
| **Test** | El spec y el nombre del test (con su `REQ-n`/código cuando lo tiene) |
| **Qué prueba** | La afirmación, en lenguaje simple |
| **Clasificación** | ✅ **Total** · ⚠️ **Parcial** · ❌ **No** (ver abajo) |
| **Ya cubierto en** | Dónde esa lógica ya se prueba hoy sin navegador (o "—" si no) |

### Clasificación

- ✅ **Total** — toda la afirmación es lógica de negocio y vive en servicios/repositorios/dominio.
  Se puede escribir un test de integración que pruebe **lo mismo**.
- ⚠️ **Parcial** — la lógica sí es probable sin navegador (y suele estar ya cubierta en vitest), pero
  el test además prueba algo que exige render/router/red. En la fila se dice **qué prueba
  visualmente**.
- ❌ **No** — la afirmación depende del navegador o del backend real (HTTP, Postgres, IndexedDB,
  service worker, cabeceras, descargas, rate-limit). No hay nada que mover.

## Carpetas por feature

| Feature | Specs E2E | Tests | Qué cubre |
|---|---|---|---|
| [`multipayments/`](multipayments/README.md) | 4 | 6 | Multipagos (módulo 16): selector de moneda, tasas por canal, multi-pago y vuelto |
| [`auth/`](auth/README.md) | 14 | 77 | Login, registro, sesión, guards de ruta, perfil y rechazos de `/me` |
| [`offline/`](offline/README.md) | 12 | 32 | Roster, activación, cifrado at-rest, service worker y diagnóstico |
| [`sales/`](sales/README.md) | 15 | 42 | Ventas, créditos, formas de pago, monedas e historiales |
| [`wholesale/`](wholesale/README.md) | 5 | 15 | Venta mayorista: escalones, piso de precio y gate de plan |
| [`inventory/`](inventory/README.md) | 17 | 68 | Inventario, almacenes, movimientos/reversas, FIFO y elaboración |
| [`catalog/`](catalog/README.md) | 5 | 17 | Productos, categorías e importación CSV |
| [`stores/`](stores/README.md) | 13 | 27 | Tiendas, planes, cambio de plan y conmutador de tienda |
| [`users/`](users/README.md) | 2 | 6 | Usuarios y creación de usuarios de tienda |
| [`expenses/`](expenses/README.md) | 2 | 6 | Gastos: alta, edición, baja e historial |
| [`sync/`](sync/README.md) | 4 | 10 | Respaldo: exportar e importar (ZIP + round-trip) |
| [`reports/`](reports/README.md) | 4 | 12 | Reporte del día, dashboard y métricas |
| [`platform/`](platform/README.md) | 9 | 31 | Infra (health/arranque), CSP, rutas de admin y pantallas de solo lectura |
| **Total** | **106** | **≈349** | |

> El conteo por código da ≈349 tests; la última corrida completa reportó 333 (la diferencia son tests
> filtrados/saltados o reutilizados por helpers).

## Resultado del análisis

- ✅ **Total: 1** — `multipayments` T10.2 (ver [`multipayments/`](multipayments/README.md)), ya
  implementado en `app/integrations/multi-payment-two-channels.integration.test.ts`.
- ⚠️ **Parcial: la gran mayoría.** La regla de negocio ya está cubierta en vitest
  (`app/**/__tests__/`, 907 archivos de test en el repo); el E2E aporta que la interfaz la pinte, que
  el router navegue y que el backend real responda.
- ❌ **No: todo lo de `platform/` y `offline/`** (despliegue, cabeceras, service worker, IndexedDB,
  rate-limit) y los 4 tests del Grupo B de tiendas/planes (la garantía es del backend).

## Dónde ya vive la cobertura "sin navegador"

| Área | Carpeta de tests |
|---|---|
| Servicios y repositorios offline | `docs/testing/integration-tests/` (plan) + `app/**/lib/services/__tests__/` |
| Dominio (puro) | `frontend-react/packages/domain/src/**/__tests__/` |
| Cifrado, DEK, roster y gate de desbloqueo | `app/shared/lib/storage/__tests__/` (17), `app/shared/lib/offline/__tests__/` (14) |
| Guards de ruta y sesión | `app/auth/routes/__tests__/` (9), `app/shared/lib/stores/__tests__/` (10) |
| Componentes y rutas (jsdom, sin navegador) | `app/**/components/__tests__/`, `app/**/routes/__tests__/` |
| Integración de negocio (patrón nuevo) | `app/integrations/` |

- *Actualizado: 2026-09-24.*
