# Guard products.tsx Against a Swallowed MissingDataKeyError — Design

- **Date:** 2026-08-12
- **Status:** Approved design, pending implementation plan
- **Scope:** Frontend only (React `web-store-pos`, `app/sales/routes/products.tsx`). No backend, DB, or API changes.

## Background

This is the follow-up flagged during the `category-default-order-max-plus-one`
final whole-branch review (`openspec/changes/archive/2026-08-12-category-default-order-max-plus-one/`):
`loadData()`, `handleAddProduct`, and `handleAddCategory` in `products.tsx`
each call an offline service method typed as "resolve, never reject"
(`ProductService`/`ProductCategoryService`'s own doc comments), but the
underlying repository call can throw `MissingDataKeyError`
(`shared/lib/storage/entity-crypto.ts:25`) when encryption is provisioned and
no data-encryption key is in memory. None of the three call sites catches it.

## The correction to how this was first described

The prior review called for "a route-level error boundary." That phrase does
not resolve to React Router's `ErrorBoundary` export
(`root.tsx:124`) — that mechanism only catches errors thrown during a loader,
an action, or synchronous render. All three failures here happen inside a
plain `async` function called from a `useEffect` or an `onClick`; a rejection
there never reaches React's render tree. Today it becomes an unhandled
promise rejection in the console, invisible to the user — exactly the silent
no-op symptom the review named.

The actual established pattern for this in this codebase is `try/catch` +
`showBlockingError`, already used one call site away:
`handleClearData`'s own repaint step (`products.tsx:346-351`) wraps
`await loadData()` for precisely this reason — its comment (`products.tsx:322`)
already says "`loadData()` can throw via `decryptEntity` when no DEK is in
memory." This design generalizes that existing pattern into a small shared
helper, rather than introducing a new mechanism.

## Existing gate, and why this gap still matters

`authLoader` (`auth/routes/loaders.ts:41-49`) already runs before every
authenticated route, including `/sales/products`: it attempts silent DEK
recovery via `bootstrapDeviceDekForRoute()`, then redirects to
`/login?unlock=1` if `needsUnlock(user)` is true. A 1-hour idle timer
(`shared/components/app-layout.tsx:50-72`) also clears the DEK and navigates
away on inactivity.

Both of those are navigation-time or state-driven — they cannot protect a
page that is already mounted and interactive when the DEK becomes
unavailable through some other path, nor can they help in whatever edge case
left `needsUnlock()` false while the DEK is still absent (the gate is
per-user roster-based, not a direct DEK check, by design — see
`unlock-gate.ts:1-13`). That edge case is genuinely narrower than "this can
happen at any moment," but the review already established it is reachable,
and the consequence today is a lie: a user who lands on `/products` in this
state sees `categories` stuck at its initial `[]`
(`products.tsx:48`) — indistinguishable from "you have no categories yet,"
the same message a brand-new store sees. The button the empty-state message
tells them to click (`handleAddCategory`) then fails the same way.

## Decisions from the brainstorm

**On failure, the user stays on the page and sees a blocking message** —
not a redirect to `/login?unlock=1`. Redirecting would treat the failure as
"your session is locked," but `needsUnlock()` can be false for this exact
login while the DEK is still null, so the unlock form might have nothing to
offer them. `showBlockingError` with an accurate, actionable message
("reload the page") is the safer default; it never sends the user somewhere
that cannot help them.

**Scope is `products.tsx` only.** The same unguarded-`useEffect` shape exists
on 17 other authenticated routes (confirmed by grep:
`available.tsx`, `sale.tsx`, `orders.tsx`, `credits.tsx`,
`today-*.tsx` × 5, `entries.tsx`, `egress.tsx`, `expenses-history.tsx`,
`today-expenses.tsx`, `today-report.tsx`, `dashboard.tsx`,
`landing-deep.tsx`) — `products.tsx` is the only one with any `try/catch` at
all, and even it doesn't cover its own mount-time load. This design adds a
reusable helper so those 17 routes can adopt the same guard later, but does
not touch them here: each has its own initial state and its own meaning of
"empty," and a mechanical sweep across all of them is separate work that
deserves its own review, not a rider on this fix.

## The guard

A new, narrowly-scoped helper — not a generic catch-all. It catches
specifically `MissingDataKeyError` and re-throws anything else, so an
unrelated regression is not silently relabeled "reload the page" and hidden
from view.

```ts
// shared/lib/storage/run-guarded-against-missing-dek.ts
import { MissingDataKeyError } from './entity-crypto';
import { showBlockingError } from '../blocking-alert';

export async function runGuardedAgainstMissingDek(
  fn: () => Promise<void>,
  title: string,
  message: string,
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof MissingDataKeyError)) throw err;
    showBlockingError(title, message);
  }
}
```

## The three call sites

Each gets its own message, matching how `handleClearData`'s three
`showBlockingError` calls (`products.tsx:353-374`) already use three distinct
messages rather than one shared string.

**Mount-time load** (`products.tsx:77-80`):

```tsx
useEffect(() => {
  runGuardedAgainstMissingDek(
    loadData,
    intl.formatMessage({ id: 'GENERAL.ERROR' }),
    'No se pudieron cargar los datos. Recargue la página.',
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadData reads only storeId
}, [storeId]);
```

`loadData()` itself (`products.tsx:62-76`) is **not modified** — it stays a
plain `async function` that can throw. `handleClearData`'s own
`try { await loadData() } catch { repainted = false }`
(`products.tsx:346-351`) is a **separate, existing, correct** guard for a
different scenario (repaint after a successful wipe, with its own message)
and is not touched.

**Add product** (`products.tsx:94-97`):

```tsx
async function handleAddProduct(category: ProductCategory) {
  await runGuardedAgainstMissingDek(
    async () => {
      const maxOrderResult = await productService.getMaxOrderByCategoryId(category.id);
      setModal({ type: 'create', category, defaultOrder: (maxOrderResult.data ?? 0) + 1 });
    },
    intl.formatMessage({ id: 'GENERAL.ERROR' }),
    'No se pudo abrir el formulario. Recargue la página.',
  );
}
```

**Add category** (`products.tsx:107-110`):

```tsx
async function handleAddCategory() {
  await runGuardedAgainstMissingDek(
    async () => {
      const maxOrderResult = await categoryService.getMaxOrder();
      setModal({ type: 'category', defaultOrder: (maxOrderResult.data ?? 0) + 1 });
    },
    intl.formatMessage({ id: 'GENERAL.ERROR' }),
    'No se pudo abrir el formulario. Recargue la página.',
  );
}
```

No new i18n message ids: the title reuses the existing `GENERAL.ERROR` key
(as every other `showBlockingError` call in this file does), and the message
bodies are raw Spanish string literals, matching `handleClearData`'s own
three messages — none of which are i18n keys either.

## Testing

Three new tests in `products.test.tsx`, mocking
`mockRejectedValueOnce(new MissingDataKeyError())` on
`categoryServiceSpies.getProductCategoriesView`,
`productServiceSpies.getMaxOrderByCategoryId`, and
`categoryServiceSpies.getMaxOrder` respectively, then asserting
`showBlockingErrorMock` was called with the exact title and message for that
call site. The existing test at `products.test.tsx:1346-1372`
(`surfaces a repaint failure separately when the wipe itself fully
succeeded`) already exercises this exact mock shape
(`mockRejectedValueOnce(new Error('no DEK in memory'))`) for
`handleClearData`'s own path — same pattern, applied to the three new sites.

The re-throw behavior is tested directly on the helper, not through
`products.tsx`: a new `run-guarded-against-missing-dek.test.ts`, colocated
with the helper, with two cases — `fn` rejecting with a `MissingDataKeyError`
resolves the wrapper and calls `showBlockingError` with the given title and
message; `fn` rejecting with a plain `Error` makes the wrapper's returned
promise reject with that same error, and `showBlockingError` is not called.
Testing this on the helper avoids asserting on an unhandled promise
rejection through a full component render, which is what re-throwing from
inside `products.tsx`'s fire-and-forget `useEffect` call would otherwise
require.

No existing test changes. `frontend-react/e2e/**` is not touched — this is
unit-test coverage only, and no E2E test asserts on this failure mode.

## Out of scope

- The other 17 authenticated routes with the same unguarded pattern. Noted
  above; each needs its own review of what its empty state means.
- Redirecting to `/login?unlock=1`. Rejected in the brainstorm — see
  "Decisions" above.
- Changing `authLoader`, the idle-lock timer, or `needsUnlock()`. Those are
  the existing, working navigation-time gate; this change only covers the
  gap they cannot cover (an already-mounted page).
- `handleClearData`'s existing three-way error handling
  (`products.tsx:328-378`). Already correct for its own scenario, not
  touched.
- `products.tsx`'s five other unguarded call sites: `handleCreateProduct`,
  `handleEditProduct`, `handleDeactivateProduct`, `handleBulkSave`, and
  `handleCategorySave`. Each awaits a mutating call (`createProduct`,
  `updateProduct`, `deleteProduct`, `createProducts`,
  `createProductCategory`/`updateProductCategory`) and then a bare, unguarded
  `loadData()` repaint. Unlike the three call sites this change fixes, the
  risk here is not confined to the repaint: the mutating call itself can
  throw `MissingDataKeyError`, because every repository write —
  `setProductsLocalStorage` (`product-repository.ts:402`) and
  `setProductCategoriesLocalStorage` (`product-category-repository.ts:229`) —
  calls `encryptEntity` before persisting, the same throw site as the three
  already-fixed reads. `deleteProduct` makes this worse, not equal:
  `ProductOfflineService.deleteProduct` is documented "never fails"
  (`product-offline-service.ts:101`) and its call site
  (`handleDeactivateProduct`, `products.tsx:210-213`) does not check
  `succeeded` at all — there is no existing envelope check for a
  `MissingDataKeyError` to hide behind on that path. These five are deferred
  rather than folded into this change because guarding them correctly means
  deciding what a caller does when the MUTATION itself half-fails — e.g. a
  wipe or an update that may or may not have persisted — which is a
  different, harder design question than the three read-only sites this
  change addresses (where failing before any state changed is unambiguous).
  That question deserves its own look, not a mechanical copy-paste of this
  change's pattern.
