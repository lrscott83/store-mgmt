# Páginas legales públicas — Privacidad y Términos generados desde los .md

Feature: **paginas-legales**. Branch: `qa`. Delivery: `ask-on-risk`.
Runner: `pnpm --filter @store-mgmt/web-store-pos test` (vitest) + `pnpm --filter @store-mgmt/web-store-pos typecheck`.

Objetivo: que las dos rutas que el footer y el registro ya enlazan (`/private-police` y
`/terms-conditions`) existan y muestren el contenido de `docs/legal/*.md`, generado desde esos
documentos (el `.md` es la fuente de verdad, no se copia a mano).

## Specs

- **S1** — `/private-police` existe y muestra `docs/legal/politica-de-privacidad.md`.
- **S2** — `/terms-conditions` existe y muestra `docs/legal/terminos-y-condiciones.md`.
- **S3** — `"usa el doc para generar las vistas"`: el contenido se **genera** desde el `.md`; una
  guarda de test falla si el módulo generado se desincroniza.
- **S4** — Son **públicas**: el footer las enlaza también desde el layout de invitado
  (`variant="guest"` en el login) y el registro las abre en otra pestaña; detrás de `app-layout`
  un visitante sin sesión acabaría en `/login`.
- **S5** — Se reutiliza el chrome del POS (`public-app-layout`, el mismo que `help/tutorial`) y los
  estilos existentes; sin dependencias nuevas (renderizador propio, mínimo).

## Tasks

| ID | S# | Ruta | Estado | Evidencia |
|----|----|------|--------|-----------|
| T1 | S3 | inline | done | `scripts/generate-legal-content.mjs` + script `generate:legal` en `package.json` |
| T2 | S3 | inline | done | `app/legal/lib/legal-content.generated.ts` (generado, commiteado) |
| T3 | S5 | inline | done | `app/legal/components/legal-document.tsx` (parser mínimo + `LegalDocument`) |
| T4 | S1,S2 | inline | done | `app/legal/routes/privacy-policy.tsx`, `app/legal/routes/terms-conditions.tsx` |
| T5 | S4 | inline | done | `app/routes.ts` dentro de `public-app-layout`; lista congelada de `routes.app-layout-membership.test.ts` ampliada a 10 con la re-verificación §3 anotada |
| T6 | todas | inline | done | tests: `legal-document.test.tsx` (6), `legal-content.test.ts` (2), `legal-pages.test.tsx` (2) |

## Log

- **L1 (2026-10-15, verbatim)** — `"pues crealas y usa el doc para generar las vistas"`
- **L2 (contexto)** — El footer (`shared/components/footer.tsx`) y el registro
  (`auth/routes/register.tsx`) ya apuntaban a `/private-police` y `/terms-conditions` desde la
  paridad con Angular; las rutas no existían y el comentario del footer lo documentaba como
  placeholder.
- **L3 (evidencia, checks)** — `typecheck` OK; `lint --max-warnings=0` OK; suite completa
  `391 archivos / 5649 passed, 6 skipped`, 0 errores de tipo. Ningún E2E tocado.
- **L4 (riesgo)** — `Risk: item 2 (débil)` → en realidad `none`: las rutas son **aditivas** y su
  contenido es estático; el único efecto sobre seguridad es que quedan **públicas por diseño**,
  decidido a conciencia y registrado en la lista congelada de rutas fuera de `app-layout`. No
  tocan datos, ni contratos existentes, ni concurrencia, ni entrega.
- **L5 (mantenimiento)** — Al cambiar `docs/legal/*.md` hay que correr
  `pnpm --filter @store-mgmt/web-store-pos generate:legal`; si no, `legal-content.test.ts` falla.
