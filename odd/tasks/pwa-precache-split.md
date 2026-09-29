# PWA Precache Split — Excluir SuperAdmin del precache

## Objetivo

Reducir el precache del PWA para que solo incluya lo que Owner y StoreUser necesitan offline. Las páginas de SuperAdmin se cargan on-demand (online).

## Problema

El patrón de precache actual `**/*.{js,css,html,woff2,webmanifest}` incluye TODOS los chunks, incluyendo páginas exclusivas de SuperAdmin que nunca usan Owner/StoreUser.

## Solución

1. Excluir chunks de SuperAdmin del precache en `precache-patterns.mjs`
2. Escribir tests E2E que verifiquen:
   - Owner/StoreUser pages (ventas, inventario, gastos, PDF, scanner, gráficos) SÍ están precacheadas
   - SuperAdmin pages NO están precacheadas

## Tareas

- [ ] T1: Excluir chunks de SuperAdmin del precache
- [ ] T2: Escribir test E2E de precache para Owner/StoreUser
- [ ] T3: Escribir test E2E de exclusión de SuperAdmin
- [ ] T4: Verificar build + tests

## Rutas exclusivas de SuperAdmin (excluir del precache)

- `admin/dashboard` → `dashboard-*.js` (el de admin, no el de statistics)
- `admin/stores` → `store-list-*.js`
- `admin/owners` → `owner-list-*.js`, `owner-create-*.js`, `owner-edit-*.js`
- `admin/resellers` → `reseller-list-*.js`, `reseller-create-*.js`, `reseller-edit-*.js`
- `admin/features` → `features-*.js`
- `management/stores/collections` → `collections-*.js` (SuperAdmin + ReSeller)
- `management/stores/commissions` → `reseller-commissions-*.js` (SuperAdmin + ReSeller)

## Rutas Owner/StoreUser (DEBEN estar precacheadas)

- Ventas: `sale-*.js`, `sale-category-products-*.js`, `today-orders-*.js`, `today-stats-*.js`, `credits-*.js`, `orders-*.js`, `wholesale-*.js`
- Inventario: `available-*.js`, `today-entries-*.js`, `entries-*.js`, `today-quantities-*.js`, `today-sales-profit-*.js`, `egress-*.js`, `warehouses-*.js`, `warehouse-movements-*.js`
- Gastos: `today-expenses-*.js`, `expenses-history-*.js`
- Reportes: `today-report-*.js`
- Estadísticas: `cuadre-por-fechas-*.js`, `dashboard-*.js` (el de statistics)
- Sync: `export-*.js`, `import-*.js`
- Management: `my-stores-*.js`, `edit-store-*.js`, `update-store-*.js`, `store-plan-*.js`, `user-list-*.js`, `user-create-*.js`, `user-edit-*.js`, `configurations-*.js`, `exchange-rates-*.js`
- Catálogo Web: `public-catalog-*.js`, `web-catalog-*.js`
- PDF: `jspdf.es.min-*.js`, `jspdf.plugin.autotable-*.js`, `html2canvas.esm-*.js`, `purify.es-*.js`, `inventory-today-sale-pdf-*.js`
- Scanner: `scanner-modal-*.js`
- Gráficos: `chart-core-*.js`

## Estado

- [ ] T1
- [ ] T2
- [ ] T3
- [ ] T4
