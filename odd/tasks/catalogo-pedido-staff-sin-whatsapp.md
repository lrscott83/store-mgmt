# Feature: catalogo-pedido-staff-sin-whatsapp

**Objective:** Que un usuario autenticado **Owner o StoreUser de una tienda** pueda **registrar
un pedido desde la MISMA vista pública del catálogo web** (`/catalog/{slug}`) **sin el paso de
envío por WhatsApp**. Mismos pasos, mismos campos, mismo pedido en el backend (idéntico a uno de
WhatsApp). **Todo online**, contra el backend; **sin offline**.

## Problem

La vista pública `/catalog/{slug}` (`frontend-react/.../catalog/routes/public-catalog.tsx`) hoy
sirve al **cliente anónimo**: carrito → checkout (`storefront-checkout.tsx`) → `POST`
`createPublicOrder` (crea el `Order` en el servidor) → arma el enlace `wa.me`
(`whatsapp-order-link.ts`) → lo abre y muestra el aviso de WhatsApp.

El owner quiere que, **cuando quien abre el catálogo sea staff de esa tienda**, el paso final no
sea "enviar por WhatsApp" sino **"registrar el pedido"** — el cliente está presente, así que no
hay nada que enviar.

## Why

Petición del owner (2026-10-08): *"que cualquier usuario autenticado (Owner o StoreUser) permita
hacer pedidos pero sin enviar por WhatsApp, como si fueran para clientes que estén en el lugar
… todo online … los usuarios autenticados no tienen el símbolo para enviarlos por WhatsApp sino
adicionar la orden con todos los mismos pasos; no cambia nada de nada, solo que se registra sin
enviar a WhatsApp."*

## Decisiones cerradas con el owner (2026-10-08)

| # | Decisión | Respuesta |
| --- | --- | --- |
| D1 | Alcance/vista | **La misma vista pública** `/catalog/{slug}`. **Todo online/backend.** **Sin offline** (el owner descartó explícitamente el offline). |
| D2 | Elegibilidad | **Solo staff de ESA tienda**: Owner/StoreUser autenticado cuyo storeId coincide con la tienda del slug. Anónimo, SuperAdmin/ReSeller y otras tiendas → flujo normal con WhatsApp. |
| D3 | El pedido | **Idéntico** a uno de WhatsApp: mismos campos, mismo `OrderType`, misma tabla. Único cambio: **no se abre `wa.me` ni se muestra el aviso de WhatsApp**. **Sin cambios de backend, sin migración.** |

## Contexto verificado (lo que ya existe)

- `public-catalog.tsx`: ruta pública **sin sesión**; `storefront-checkout.tsx:97-165` hace
  `createPublicOrder` → `buildWhatsAppOrderLink` → `window.open(link)` + `setWhatsapp(...)`.
- El pedido **ya se crea en el backend** antes del enlace de WhatsApp; quitar WhatsApp es solo UI.
- `useAuthStore` (`app/shared/lib/stores/auth-store.ts:136`) es un store Zustand que **hidrata
  sincrónicamente** al evaluar el módulo (`:530-548`, `typeof window !== 'undefined'`). No lo
  consume hoy ninguna pieza del catálogo público.
- `UserModel` (`packages/domain/src/models/auth.ts:95`): `isSuperAdmin`, `isOwnerAdmin`,
  `isReSeller`, `selectedStoreId: string`, `roles: StoreModuleFeatures[]` (cada uno con
  `storeId`), `storeList?: StoreSummary[]` (`StoreSummary.id`). `ERoles.OwnerAdmin = 2`,
  `StoreUser = 3`.
- `PublicCatalog.storeId` (`catalog-http-service.ts:128`).
- i18n: **solo** `app/shared/lib/i18n/es.ts` (no hay otros locales).
- **Angular (`frontend/`) es legacy: no se lee ni se toca.** **E2E intocable** (no se modifican
  tests Playwright ni sus support files).

## Regla de elegibilidad (D2)

`isCatalogStoreStaff(user, catalogStoreId)` → `true` solo si:

1. hay `user` y `catalogStoreId`;
2. `!user.isSuperAdmin && !user.isReSeller`;
3. **pertenece a la tienda**: `user.selectedStoreId === catalogStoreId` **o**
   `user.storeList?.some(s => s.id === catalogStoreId)` **o**
   `user.roles.some(r => r.storeId === catalogStoreId)`;
4. **rol en la tienda**: `user.isOwnerAdmin` **o** `user.roles.some(r => r.storeId === catalogStoreId)`.

Cualquier otro caso → flujo normal (con WhatsApp).

## Autorizado (scope)

**Solo frontend — `frontend-react/apps/web-store-pos/`.**

- Nuevo helper puro de elegibilidad + sus tests.
- Prop `staffMode` en `StorefrontCheckout`: cambia la etiqueta del botón y, tras el alta, **omite
  `window.open` y el aviso de WhatsApp**; sigue llamando `onCreated`.
- Cableado en `public-catalog.tsx`: lee `useAuthStore` y calcula `catalog?.storeId`.
- Claves i18n nuevas en `es.ts`.
- Tests nuevos (unit) que cubran elegibilidad y modo staff.

**NO se toca:** backend (ninguna clase/migración/script), Angular `frontend/`, E2E (ni tests ni
support files), ni el comportamiento del flujo normal del cliente anónimo.

## Tasks

- [x] T0 — Documento de feature + espejo en Engram (antes del primer write).**Doc `odd/tasks/catalogo-pedido-staff-sin-whatsapp.md`; espejo Engram topic `odd/catalogo-pedido-staff-sin-whatsapp/tasks`.**
- [x] T1 — Helper puro `isCatalogStoreStaff(user, catalogStoreId)` + test unitario (nuevo). **`catalog/lib/catalog-staff.ts`; 19 tests.**
- [x] T2 — `StorefrontCheckout` prop `staffMode`: etiquetas + omitir WhatsApp tras el alta. **`storefront-checkout.tsx`; 6 tests nuevos.**
- [x] T3 — `public-catalog.tsx`: detectar staff de la tienda y pasar `staffMode`. **`useAuthStore` + `isCatalogStoreStaff(user, catalog?.storeId)`.**
- [x] T4 — Claves i18n nuevas en `es.ts` (etiqueta y textos de registro). **`CHECKOUT.SUBMIT_STAFF` / `CHECKOUT.SUBMITTING_STAFF`.**
- [x] T5 — Tests unitarios nuevos (helper; checkout en modo staff; cableado del catálogo). **Añadidos 6 casos a `public-catalog.test.tsx` (24→30); ninguna aserción existente borrada/debilitada.**
- [ ] T6 — Checks (vitest focalizado + suite, typecheck, lint) + commit del work-unit. **Focalizado: 55/55 verde. Suite: 5316 passed / 0 failed. Lint 0. Typecheck: 68 errores PREEXISTENTES (idénticos en baseline con `git stash -u`; 67 en `.react-router/types/+routes.ts` generado + 1 en `decryption-failure-policy.ts:192`), ninguno en catálogo.**

## Route plan (por tarea; presupuesto de líneas ~400 es advisory)

Un solo writer delegado (trigger: 2+ ficheros no triviales), trabajo secuencial. Commits
convencionales en `test` (rama actual). Push/PR = decisión del humano.

## Checks

- `pnpm --filter @store-mgmt/web-store-pos exec vitest run <ficheros nuevos>`
- `pnpm --filter @store-mgmt/web-store-pos test` (suite completa verde; los nuevos solo suman)
- `pnpm --filter @store-mgmt/web-store-pos typecheck` (0 errores)
- `pnpm --filter @store-mgmt/web-store-pos lint` (0 warnings)
- Verificar que **ningún** fichero E2E aparece modificado en `git diff --stat`.

## Acceptance criteria

1. Anónimo, SuperAdmin/ReSeller y staff de OTRA tienda: flujo actual intacto (con WhatsApp).
2. Owner/StoreUser de la tienda del slug: el botón dice "Registrar pedido" y tras el alta **no**
   se abre `wa.me` ni aparece el aviso de WhatsApp; el pedido queda registrado (misma llamada
   `createPublicOrder`, mismos campos) y el padre abre el estado del pedido creado.
3. Sin cambios en backend ni migraciones.

## Progress

- 2026-10-08 — Doc creado. Decisiones D1–D3 cerradas con el owner. Implementación pendiente.
