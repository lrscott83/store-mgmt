// device-wrapped-dek design §3 (WU8, task 8.7 — optional structural guard):
// a cheap regression guard for §3's grep-verified proof that nothing
// outside `app-layout` can reach the 16 sync `encryptEntity`/`decryptEntity`
// call sites. Adding a new public/guest-only route file fails this test and
// forces a human to re-run §3's proof before merging — it does not itself
// assert anything about entity storage.
import { describe, it, expect } from 'vitest';
import routes from '../routes';

interface RouteEntry {
  file?: string;
  id?: string;
  children?: RouteEntry[];
}

// Design §3 step 3: the route module files reachable WITHOUT going through
// `app-layout`'s `authLoader`.
//
// §3 RE-VERIFIED 2026-09-27 (WebCatalog module, plan
// `docs/plans/2026-09-27-web-catalog-module-plan.md`): `catalog/routes/public-catalog.tsx`
// is the storefront at `/catalog/<slug>` and MUST stay anonymous — it is a shopper's
// page, so it cannot sit behind `app-layout`. The file only issues HTTP calls
// (`catalogHttpService`) and reads plain response DTOs: it touches NO
// `encryptEntity`/`decryptEntity` seam and has no clientLoader of its own, so §3's
// conclusion (nothing outside `app-layout` reaches the encrypted entity store) still
// holds for it.
// §3 RE-VERIFIED 2026-10-15 (páginas legales del POS): `legal/routes/privacy-policy.tsx`
// y `legal/routes/terms-conditions.tsx` son las páginas de Políticas de Privacidad y
// Términos y Condiciones. MUST stay anonymous: el footer las enlaza también desde el
// layout de invitado y el register las abre en otra pestaña, así que detrás de
// `app-layout` un visitante sin sesión acabaría en `/login`. Ninguna de las dos tiene
// `clientLoader` y su único contenido es el Markdown generado desde `docs/legal/*.md`
// (`generate:legal`) más un renderizador sin estado: no tocan ningún seam
// `encryptEntity`/`decryptEntity`, así que §3 sigue en pie.
// §3 RE-VERIFIED 2026-10-22 (diagnóstico público): `diagnostics/routes/diagnostics.tsx`
// sale de `app-layout` para poder abrirse sin sesión (el dueño debe poder enviar el
// registro de un dispositivo que no logra iniciar sesión). Vive bajo
// `public-app-layout` (mismo chrome, sin authLoader), no tiene `clientLoader` propio y
// solo lee/escribe el buffer en localStorage (`client-log.ts`): no toca ningún seam
// `encryptEntity`/`decryptEntity`, así que §3 sigue en pie.
const FROZEN_OUTSIDE_APP_LAYOUT = [
  'auth/routes/login.tsx',
  'auth/routes/provision.tsx',
  'auth/routes/register.tsx',
  'catalog/routes/public-catalog.tsx',
  'diagnostics/routes/diagnostics.tsx',
  'help/routes/tutorial.tsx',
  'home/routes/landing-deep.tsx',
  'legal/routes/privacy-policy.tsx',
  'legal/routes/terms-conditions.tsx',
  'shared/routes/$.tsx',
  'shared/routes/health.tsx',
].sort();

function collectLeafFilesOutsideAppLayout(
  entries: RouteEntry[],
  insideAppLayout: boolean,
): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    const nowInside = insideAppLayout || entry.id === 'app-layout';
    if (entry.children && entry.children.length > 0) {
      out.push(...collectLeafFilesOutsideAppLayout(entry.children, nowInside));
    } else if (entry.file && !nowInside) {
      out.push(entry.file);
    }
  }
  return out;
}

describe('routes.ts — the set of route files outside app-layout is frozen (device-wrapped-dek design §3)', () => {
  it('equals the exact 11-item list §3 verified nothing bypasses the authLoader/DEK-bootstrap gate', () => {
    const outside = collectLeafFilesOutsideAppLayout(routes as RouteEntry[], false).sort();
    expect(outside).toEqual(FROZEN_OUTSIDE_APP_LAYOUT);
  });
});
