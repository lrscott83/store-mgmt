# Etapa 2 — Plan general: Servicios offline del módulo de ventas

> Documento de **especificación de pruebas**, no de implementación.
>
> **Regla del proyecto (`CLAUDE.md`, innegociable)**: *"Never modify, delete, rename, skip, weaken, or 'fix' an existing E2E test without explicit authorization from the user."*

## 1. Alcance

La Etapa 2 cubre **las operaciones que operan contra `localStorage` (cifrado en reposo con AES-GCM) y NO cruzan la frontera hacia la API**. Son los dominios offline-first de la app: productos, ventas, inventario, gastos, créditos, reportes, estadísticas y sincronización.

A diferencia de la Etapa 1 (donde Playwright golpea la API real), la Etapa 2 se prueba principalmente con **vitest** (unit/integration tests contra servicios y repositorios mockeados) y **Playwright** solo para flujos de UI que involucran interacción del usuario con formularios, descargas y exports.

### Qué queda FUERA

| Fuera de alcance | Razón |
|---|---|
| Operaciones con API real (login, registro, CRUD de usuarios/tiendas) | Ya cubierto en Etapa 1 |
| Comportamiento offline puro de la sesión (login offline, aprovisionamiento) | Ya cubierto en Etapa 1 (S1-03) |
| Cifrado at-rest (DEK, wrap, unwrap) | Cubierto por vitest existentes (`*.crypto.test.ts`) |

---

## 2. Bloques de User Stories

### Bloque A — Productos y categorías

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S2-A1](S2-A1.md) | CRUD offline de productos | CRÍTICA | ✅ CUBIERTO — `products-crud.spec.ts` (6 tests, 6 aserciones) |
| [S2-A2](S2-A2.md) | CRUD offline de categorías | CRÍTICA | ✅ CUBIERTO — `category-crud.spec.ts` (5 tests, 5 aserciones) |
| [S2-A3](S2-A3.md) | Importación CSV de productos | ALTA | Parsear CSV, validar, importar masivamente |
| [S2-A4](S2-A4.md) | Disponibilidad de productos | ALTA | Filtrar productos por categoría, búsqueda, estado |

### Bloque B — Ventas y órdenes

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S2-B1](S2-B1.md) | Crear venta (nueva orden) | CRÍTICA | ✅ CUBIERTO — `create-sale.spec.ts` (4 tests, 5 aserciones) |
| [S2-B2](S2-B2.md) | Editar y eliminar órdenes | ALTA | Modificar órdenes existentes, eliminar |
| [S2-B3](S2-B3.md) | Órdenes del día | ALTA | Listado de órdenes del día actual |
| [S2-B4](S2-B4.md) | Historial de órdenes | MEDIA | Listado de todas las órdenes |

### Bloque C — Créditos

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S2-C1](S2-C1.md) | Crear crédito desde venta | ALTA | Marcar una venta como crédito |
| [S2-C2](S2-C2.md) | Registrar pago de crédito | ALTA | Abonar un crédito parcial o total |
| [S2-C3](S2-C3.md) | Créditos del día y historial | MEDIA | Listados de créditos |

### Bloque D — Inventario

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S2-D1](S2-D1.md) | Entradas de inventario | ALTA | Registrar entradas de stock |
| [S2-D2](S2-D2.md) | Egreso de inventario | ALTA | Registrar egresos de stock |
| [S2-D3](S2-D3.md) | Cantidades del día | MEDIA | Resumen de cantidadesmovidas |
| [S2-D4](S2-D4.md) | Productos disponibles en inventario | MEDIA | Stock disponible por producto |
| [S2-D5](S2-D5.md) | Cálculo de ganancia | MEDIA | Ganancia neta del día |

### Bloque E — Gastos

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S2-E1](S2-E1.md) | Registrar gasto | ALTA | Crear un gasto del día |
| [S2-E2](S2-E2.md) | Historial de gastos | MEDIA | Listado de gastos |

### Bloque F — Reportes y estadísticas

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S2-F1](S2-F1.md) | Reporte del día | ALTA | Resumen de ventas, gastos, ganancia |
| [S2-F2](S2-F2.md) | Dashboard de estadísticas | MEDIA | Métricas agregadas |

### Bloque G — Sincronización

| US | Título | Prioridad | Descripción |
|---|---|---|---|
| [S2-G1](S2-G1.md) | Exportar datos | CRÍTICA | Serializar localStorage a archivo ZIP cifrado |
| [S2-G2](S2-G2.md) | Importar datos | CRÍTICA | Deserializar archivo ZIP y merge con datos existentes |

---

## 3. Enfoque de testing

### vitest (unit/integration) — la capa principal

La mayoría de la cobertura de Etapa 2 vive en vitest:

| Qué se prueba | Cómo |
|---|---|
| Servicios offline (`product-offline-service.ts`, `order-offline-service.ts`, etc.) | Mock de repositorio, aserciones de CRUD |
| Repositorios (`product-repository.ts`, `product-category-repository.ts`) | Mock de localStorage, aserciones de persistencia |
| Cifrado at-rest (crypto) | `*.crypto.test.ts` existentes — round-trip de serialización/deserialización |
| Utilidades (`csv-product-parser.ts`, `order-type-utils.ts`, `profit-calculator.ts`) | Tests puros de función |
| Fábricas (`product-service.factory.ts`, `product-category-service.factory.ts`) | Verificar que eligen online vs offline correctamente |

### Playwright (E2E) — solo para flujos de UI

Playwright se usa en Etapa 2 solo para:

1. **Interacción del usuario** con formularios CRUD (crear producto, registrar venta, etc.)
2. **Descargas** (export de datos)
3. **Navegación** entre pantallas offline
4. **Comportamiento offline simulado** (verificar que la UI funciona sin conexión)

### Backend .NET — N/A

La Etapa 2 no tiene contraparte server-side: los datos viven en `localStorage` del cliente. El backend solo interviene en la Etapa 1 (login, registro, CRUD de usuarios/tiendas) y en la sincronización (que es un flujo basado en archivos, no HTTP).

---

## 4. Convenciones

### Estado de cobertura

- **CUBIERTO** — existe cobertura real (vitest o Playwright) para las aserciones del escenario.
- **PARCIAL** — hay cobertura pero faltan aserciones.
- **PENDIENTE** — no existe ningún test.
- **N/A** — la capa no aplica.

### Datos de prueba

Los tests de Etapa 2 no necesitan backend levantado. Los datos se crean en memoria (mock de repositorio o localStorage real en vitest, localStorage real en Playwright).

### Cifrado

Los repositorios usan AES-GCM con una DEK derivada de la contraseña del usuario. Los tests de cifrado (`*.crypto.test.ts`) verifican el round-trip completo.

---

## 5. Estado actual (pre-Etapa 2)

### Lo que ya existe en vitest

| Dominio | Tests existentes | Cobertura |
|---|---|---|
| Productos | `product-offline-service.test.ts`, `product-repository.test.ts`, `product-repository.crypto.test.ts` | CRUD + cifrado |
| Categorías | `product-category-offline-service.test.ts`, `product-category-repository.test.ts`, `product-category-repository.crypto.test.ts` | CRUD + cifrado |
| Órdenes | `order-offline-service.test.ts`, `order-offline-service.crypto.test.ts` | CRUD + cifrado |
| Créditos | `sale-credit-offline-service.test.ts`, `sale-credit-offline-service.crypto.test.ts` | CRUD + cifrado |
| Inventario | `inventory-offline-service.test.ts`, `inventory-offline-service.crypto.test.ts` | CRUD + cifrado |
| Gastos | `expense-offline-service.test.ts`, `expense-offline-service.crypto.test.ts` | CRUD + cifrado |
| Sync | `data-serializer-service.test.ts`, `data-synchronizer-service.test.ts` | Serialización + sync |
| Utilidades | `csv-product-parser.test.ts`, `order-type-utils.test.ts`, `profit-calculator.test.ts` | Unit tests puros |
| Fábricas | `product-service.factory.test.ts`, `product-category-service.factory.test.ts` | Verificación de elección online/offline |
| PDF | `generate-product-rows-for-date.test.ts`, `generate-product-rows.test.ts`, `inventory-today-sale-pdf.test.ts` | Generación de reportes |

### Lo que falta (candidatos a Etapa 2)

| Dominio | Qué falta | Prioridad |
|---|---|---|
| **UI flows** | Tests de Playwright para CRUD de productos/categorías/ventas/gastos desde la UI | Crítica |
| **Offline simulation** | Verificar que la UI funciona correctamente cuando el navegador está offline | Crítica |
| **Export/Import** | Tests de descarga de archivo ZIP y re-importación | Crítica |
| **Integrity** | Verificar que los datos persistidos en localStorage son consistentes tras operaciones CRUD | Alta |
| **Edge cases** | Límites de almacenamiento, concurrencia de pestañas, datos corruptos | Media |
