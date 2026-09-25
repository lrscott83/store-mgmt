# Integración — Reportes y dashboard

> Specs E2E cubiertos: `daily-report.spec.ts`, `reports-today.spec.ts`, `dashboard-metrics.spec.ts`,
> `dashboard-metrics-values.spec.ts` (12 tests).
>
> **Leyenda**
> - ✅ **Total** — toda la afirmación es lógica de negocio y vive en servicios/repositorios/dominio.
> - ⚠️ **Parcial** — la lógica es probable sin navegador, pero el test además prueba algo que exige
>   render/router/red (se indica qué).
> - ❌ **No** — la afirmación depende del navegador o del backend real.
>
> **Regla del proyecto:** los specs E2E no se tocan sin autorización explícita del usuario.

| Test | Qué prueba | Clasificación | Ya cubierto en |
|---|---|---|---|
| `daily-report` — el reporte muestra el header "Cuadre del día" | Que la pantalla del cuadre carga con su encabezado | ❌ **No** — es una aserción de pantalla | — |
| `daily-report` — el panel Resumen Efectivo se puede expandir | Que el acordeón del resumen abre | ❌ **No** — es interacción de interfaz | — |
| `daily-report` — el panel Ventas se puede expandir y muestra categorías | Que el acordeón de ventas abre y lista categorías | ⚠️ **Parcial** — las categorías y sus totales son del servicio de órdenes; **visual:** el acordeón | `sales/lib/services/__tests__/order-offline-service*` |
| `reports-today` — la página carga con título y resumen de ventas | Que el reporte del día carga con sus totales | ⚠️ **Parcial** — los totales son del servicio; **visual:** el título y el resumen | `sales/lib/services/__tests__/order-offline-service*` |
| `reports-today` — los valores de métricas muestran formato de moneda | Que los montos se pintan con número + moneda | ⚠️ **Parcial** — el formateo es puro (`formatMoneyWithCurrency`); **visual:** el texto pintado | `shared/lib/__tests__/` (formato de moneda) |
| `reports-today` — botón de exportar PDF está presente | Que existe el botón de exportar | ❌ **No** — es una aserción de pantalla | — |
| `dashboard-metrics` — el dashboard muestra métricas de ventas y ganancia | Que el dashboard pinta las métricas clave | ⚠️ **Parcial** — las métricas son del servicio; **visual:** las tarjetas | `statistics/routes/__tests__/` (3), `statistics/components/__tests__/` (2) |
| `dashboard-metrics-values` — KPI cards: Ventas, Gastos, Créditos, Ganancias son visibles | Que las cuatro tarjetas existen | ❌ **No** — aserción de pantalla | — |
| `dashboard-metrics-values` — los indicadores de tendencia muestran glifo (▲, ▼ o –) y el texto "vs anterior" | Que la tendencia se pinta con su glifo y su leyenda | ⚠️ **Parcial** — el cálculo de la tendencia es puro (comparación de periodos); **visual:** el glifo y el texto | `statistics/components/__tests__/` |
| `dashboard-metrics-values` — el conmutador de moneda cambia de CUP a USD | Que el dashboard convierte a USD | ⚠️ **Parcial** — la conversión es pura (`convertLineAmount` con la tasa del día); **visual:** el toggle y los números | `management/exchange-rates/lib/services/__tests__/`, dominio `channel-conversion` |
| `dashboard-metrics-values` — los gráficos de ventas y ganancia renderizan con datos o estado vacío | Que los gráficos no se caen | ❌ **No** — es render de gráficos (SVG) | — |
| `dashboard-metrics-values` — la lista de productos top renderiza | Que el top de productos lista | ⚠️ **Parcial** — el ranking es del servicio; **visual:** la lista | `statistics/routes/__tests__/` |

**Ninguno es ✅ Total.** En los reportes la afirmación es "esta pantalla muestra estos números
calculados", y el cálculo (servicio) ya está cubierto; lo que el E2E aporta es que la pantalla los
pinte. Un test de integración podría asertar los agregados, pero no lo "que se ve".

- *Actualizado: 2026-09-24.*
