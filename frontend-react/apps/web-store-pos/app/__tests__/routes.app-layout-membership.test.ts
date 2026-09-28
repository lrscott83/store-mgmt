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
const FROZEN_OUTSIDE_APP_LAYOUT = [
  'auth/routes/login.tsx',
  'auth/routes/provision.tsx',
  'auth/routes/register.tsx',
  'catalog/routes/public-catalog.tsx',
  'help/routes/tutorial.tsx',
  'home/routes/landing-deep.tsx',
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
  it('equals the exact 8-item list §3 verified nothing bypasses the authLoader/DEK-bootstrap gate', () => {
    const outside = collectLeafFilesOutsideAppLayout(routes as RouteEntry[], false).sort();
    expect(outside).toEqual(FROZEN_OUTSIDE_APP_LAYOUT);
  });
});
