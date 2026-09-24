# Integración — Plataforma (infra, rutas, CSP, pantallas de administración)

> Specs E2E cubiertos: `api-health.spec.ts`, `smoke.spec.ts`, `superadmin-smoke.spec.ts`,
> `misc-screens.spec.ts`, `read-only-screens.spec.ts`, `admin-routes.spec.ts`,
> `configurations.spec.ts`, `csp-enforcing-export.spec.ts`, `csp-report-only.spec.ts` (31 tests).
>
> **Leyenda**
> - ✅ **Total** — toda la afirmación es lógica de negocio y vive en servicios/repositorios/dominio.
> - ⚠️ **Parcial** — la lógica es probable sin navegador, pero el test además prueba algo que exige
>   render/router/red (se indica qué).
> - ❌ **No** — la afirmación depende del navegador o del backend real.
>
> **Regla del proyecto:** los specs E2E no se tocan sin autorización explícita del usuario.

Esta carpeta es, en su mayoría, lo que **solo** el E2E puede probar: que el backend responde, que la
app arranca, que las cabeceras de seguridad llegan en la respuesta y que cada ruta pinta algo.

| Test | Qué prueba | Clasificación | Ya cubierto en |
|---|---|---|---|
| `api-health` — the API answers ping | Que el backend está vivo | ❌ **No** — es una prueba de despliegue | — |
| `api-health` — the API rejects an unauthenticated caller | Que el backend exige autenticación | ❌ **No** — es del backend | Backend E2E (`SMCA.WebApi.E2ETests`) |
| `smoke` — `/login` renderiza el formulario | Que la app arranca y pinta el login | ❌ **No** — es arranque/render | — |
| `smoke` — `/` responde y renderiza contenido raíz | Que la raíz responde | ❌ **No** — ídem | — |
| `superadmin-smoke` FC-D1 — la persona SuperAdmin produce `isSuperAdmin=true` | Que el util de creación de sesión del arnés es correcto | ❌ **No** — es infraestructura del arnés de E2E | — |
| `misc-screens` — la página de tutorial carga y muestra su título | Que `/help/tutorial` carga | ❌ **No** — aserción de pantalla | — |
| `misc-screens` — el panel colapsable abre y muestra pasos | Que el acordeón abre | ❌ **No** — interacción de interfaz | — |
| `misc-screens` — una ruta desconocida redirige a la raíz | Que el catch-all 404 redirige | ⚠️ **Parcial** — la regla del catch-all es de router (configuración declarativa); **visual:** la navegación | `app/__tests__/routes.app-layout-membership.test.ts` |
| `read-only-screens` — S2-A4 Inventario (disponible) carga | Que la pantalla de inventario disponible carga | ⚠️ **Parcial** — el stock agrupado es del servicio; **visual:** la pantalla | `inventory/lib/services/__tests__/` (9) |
| `read-only-screens` — S2-B3 Historial de órdenes carga | Que el historial carga | ⚠️ **Parcial** — las órdenes son del servicio; **visual:** la lista | `sales/lib/services/__tests__/order-offline-service*` |
| `read-only-screens` — S2-C3 Créditos (historial) carga | Que el historial de créditos carga | ⚠️ **Parcial** — los créditos son del servicio; **visual:** la lista | `sales/lib/services/__tests__/sale-credit-offline-service*` |
| `read-only-screens` — S2-D3 Cantidades del día carga | Que el reporte de cantidades carga | ⚠️ **Parcial** — los agregados son del servicio; **visual:** la tabla | `inventory/lib/services/__tests__/` |
| `read-only-screens` — S2-D4 Productos disponibles en inventario carga | Que la vista por categoría carga | ⚠️ **Parcial** — ídem | ídem |
| `read-only-screens` — S2-D5 Ganancias del día carga | Que la ganancia del día carga | ⚠️ **Parcial** — el cálculo costo/precio es del servicio; **visual:** la tabla | ídem |
| `read-only-screens` — S2-E2 Historial de gastos carga | Que el historial de gastos carga | ⚠️ **Parcial** — del servicio de gastos; **visual:** la lista | `expenses/lib/services/__tests__/` |
| `read-only-screens` — S2-F2 Dashboard de estadísticas carga | Que el dashboard carga | ⚠️ **Parcial** — las métricas son del servicio; **visual:** las tarjetas | `statistics/routes/__tests__/` |
| `admin-routes` FC-D4 — `/admin/features` carga | Que la ruta de features carga con la sesión SuperAdmin | ⚠️ **Parcial** — el gate es puro (`superAdminLoader`); **visual:** la ruta y su contenido | `auth/routes/__tests__/loaders.test.ts`, `admin/features/routes/__tests__/` (1) |
| `admin-routes` FC-D5 — `/admin/stores` carga | Ídem para tiendas | ⚠️ **Parcial** — ídem | `admin/stores/routes/__tests__/` (1) |
| `admin-routes` FC-D6 — `/admin/dashboard` carga | Ídem para el dashboard admin | ⚠️ **Parcial** — ídem | `admin/dashboard/routes/__tests__/` (1) |
| `admin-routes` FC-D2 — `/admin/owners` carga con encabezado | Ídem para owners | ⚠️ **Parcial** — ídem | `admin/owners/routes/__tests__/` (3) |
| `admin-routes` FC-D3 — `/admin/resellers` carga | Ídem para resellers | ⚠️ **Parcial** — ídem | `admin/resellers/routes/__tests__/` (3) |
| `admin-routes` FC-D7 — `/management/stores/collections` carga | Que la ruta de cobros carga | ⚠️ **Parcial** — ídem | `management/stores/routes/__tests__/` (7) |
| `admin-routes` FC-D8 — `/management/stores/commissions` carga | Que la ruta de comisiones carga | ⚠️ **Parcial** — ídem | ídem |
| `configurations` FC-B2 — sin MultiStores la página muestra el heading y NO el selector de tienda activa | Que sin MultiStores no hay selector de tienda activa | ⚠️ **Parcial** — el gate es puro (`hasMultiStores` sobre los módulos de la tienda); **visual:** que el selector no esté | `management/configurations/routes/__tests__/configurations.test.tsx` |
| `configurations` FC-B2 — con MultiStores el selector de tienda activa se renderiza con opciones | Que con MultiStores el selector lista las tiendas | ⚠️ **Parcial** — el listado de tiendas activas es del servicio/estado; **visual:** que las opciones aparezcan en el desplegable | ídem |
| `csp-enforcing-export` — sirve el header `Content-Security-Policy` enforcing exacto | Que el header que nginx servirá es el esperado | ❌ **No** — es una prueba de despliegue/headers | `scripts/__tests__/csp-nginx.test.mjs` |
| `csp-enforcing-export` — ZIP export bajo enforcing: descarga completa sin violaciones | Que exportar no viola la CSP | ❌ **No** — necesita navegador real con headers | `scripts/__tests__/csp-*` (política) |
| `csp-enforcing-export` — PDF export bajo enforcing: descarga completa sin violaciones | Ídem para PDF | ❌ **No** — ídem | ídem |
| `csp-report-only` — el header está presente, es report-only y lleva las directivas requeridas | Que en dev se sirve la política report-only completa | ❌ **No** — headers | `scripts/__tests__/csp-*` |
| `csp-report-only` — una violación real se reporta, no se bloquea | Que report-only no bloquea | ❌ **No** — navegador + red | — |
| `csp-report-only` — cero violaciones en las rutas públicas principales | Que las rutas públicas no violan la política | ❌ **No** — navegador + red | `scripts/csp-known-dev-violations.mjs` (lista de excepciones conocidas) |

**Ninguna es ✅ Total.** Esta carpeta es, por definición, la que se queda en E2E: son pruebas de
despliegue, de arranque, de cabeceras o de "la pantalla pinta".

- *Actualizado: 2026-09-24.*
