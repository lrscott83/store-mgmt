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

**Superseded by Task 4.** Once this design's eight call sites (three below, five in
"The five sibling mutation handlers") were all written, every caller that needed to
know whether it was safe to proceed had to hoist a mutable `let succeeded` flag and
assign it from inside the guarded callback — the direct consequence of `fn` and the
wrapper both returning `Promise<void>`. Task 4 changes the signature to
`fn: () => Promise<boolean>` / returns `Promise<boolean>`: `fn` reports its own
outcome by returning `true`/`false`, the wrapper passes that straight through, and
only forces `false` itself when it catches a `MissingDataKeyError`. Every hoisted
flag below except `handleBulkSave`'s `domainSucceeded` (which answers a genuinely
different question — see that section) disappears, replaced by
`const ok = await runGuardedAgainstMissingDek(...); if (!ok) return;`. The code
blocks in this document were not rewritten to match; the plan's Task 4 has the
exact, current code for the helper and all eight call sites.

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

## The five sibling mutation handlers

**Correction to this design's own first draft.** The original "Out of scope"
section deferred `handleCreateProduct`, `handleEditProduct`,
`handleDeactivateProduct`, `handleBulkSave`, and `handleCategorySave` on the
premise that guarding them required "deciding what a caller does when the
mutation itself half-fails." On inspection that premise is false: every
mutating repository write —
`setProductsLocalStorage` (`product-repository.ts:402`) and
`setProductCategoriesLocalStorage` (`product-category-repository.ts:229`) —
mutates its in-memory `Map`, then calls `encryptEntity` synchronously
*before* `localStorage.setItem` runs. If `encryptEntity` throws, the
`setItem` call is never reached, so nothing persists. No `await` sits
between the in-memory mutation and the persistence call in any of these
paths, and JavaScript's single-threaded execution means the DEK cannot
disappear mid-call. The failure is therefore all-or-nothing, exactly like
the three already-fixed read sites — there is no partial-mutation state to
reason about. `createProductService`/`createProductCategoryService` are also
reconstructed on every `ProductsPage` render (`products.tsx:53-54`), so even
the discarded in-memory `Map` from a failed write cannot leak into a later
call.

**Two guards per handler, not one — the mutation and the repaint are
independent failures with independent messages**, matching
`handleClearData`'s own established shape (`products.tsx:346-374`: a
`repainted` flag, checked separately from the wipe's own success). The
mutation guard wraps the service call and its existing `succeeded` check;
on `MissingDataKeyError`, it shows a message and the modal stays open,
unchanged from how a domain failure (e.g. `NameExists`) already behaves
today. Only if the mutation genuinely succeeded does the handler close its
modal and fire the **second**, separate guard around the trailing `loadData()`
repaint — not awaited, matching every one of these handlers' existing
fire-and-forget `loadData()` call today, but now guarded instead of an
unhandled rejection.

An outer `let succeeded = false` flag, set inside the mutation guard's
callback, tells the handler whether to proceed to the repaint — the same
idiom `handleClearData` already uses for `cartCleared`/`repainted`.

**`handleBulkSave` keeps its documented Angular-parity divergence
untouched**: today it calls `setModal(null)` and `loadData()`
*unconditionally*, before checking `result.succeeded`, because Angular's own
`onSubmit` closes the modal and emits its update event before checking the
response (`edit-products-modal.component.ts:74-107` — "do not fix"). The
mutation guard here only protects the `createProducts` call itself from a
`MissingDataKeyError` throw; once that call returns (successfully, even if
some individual items failed with a domain error), `setModal(null)` and the
repaint proceed exactly as today, and the existing informational
"some products already exist" message still fires off the domain-level
`result.succeeded` check.

**`handleDeactivateProduct` has no domain failure branch to preserve** —
`ProductOfflineService.deleteProduct` is documented "never fails"
(`product-offline-service.ts:101`) and its call site never checked
`succeeded`. The mutation guard here is the *only* protection this call
gains; there was no existing envelope check for a `MissingDataKeyError` to
hide behind.

Per-handler messages, following the file's own convention of a distinct
message per failure (`handleClearData`'s three messages,
`products.tsx:353-374`):

| Handler | Mutation-guard message | Repaint-guard message |
|---|---|---|
| `handleCreateProduct` | No se pudo guardar el producto. Recargue la página. | El producto fue guardado, pero no se pudo actualizar la vista. Recargue la página. |
| `handleEditProduct` | No se pudo actualizar el producto. Recargue la página. | El producto fue actualizado, pero no se pudo actualizar la vista. Recargue la página. |
| `handleDeactivateProduct` | No se pudo desactivar el producto. Recargue la página. | El producto fue desactivado, pero no se pudo actualizar la vista. Recargue la página. |
| `handleBulkSave` | No se pudieron guardar los productos. Recargue la página. | Los productos fueron guardados, pero no se pudo actualizar la vista. Recargue la página. |
| `handleCategorySave` | No se pudo guardar la categoría. Recargue la página. | La categoría fue guardada, pero no se pudo actualizar la vista. Recargue la página. |

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

For each of the five sibling handlers, two new tests in `products.test.tsx`:
the mutation guard, via `mockRejectedValueOnce(new MissingDataKeyError())` on
its own service spy (`productServiceSpies.{createProduct,updateProduct,
deleteProduct,createProducts}` / `categoryServiceSpies.
{createProductCategory,updateProductCategory}`), asserting the mutation-guard
message and that the modal did not close; and the repaint guard, letting the
mutation succeed and rejecting `categoryServiceSpies.getProductCategoriesView`
(the first call inside `loadData()`) once, asserting the repaint-guard
message and that the modal DID close. A third, dedicated test (added in
Task 5, closing a gap the round-2 review found) asserts both the pre-existing
"some products already exist" message and the repaint-guard message fire
together from one import, when the mutation resolves with a domain-level
`succeeded: false` **and** the repaint separately throws
`MissingDataKeyError` — proving the two paths stay independent even when
both occur in the same call.

No existing test changes. `frontend-react/e2e/**` is not touched — this is
unit-test coverage only, and no E2E test asserts on this failure mode.

## `handleCsvImport` — the sixth mutation handler (Task 5)

A round-2 whole-branch review found `handleCsvImport` (`products.tsx:349-408`)
has the identical unguarded shape as the five siblings: it awaits
`productService.createCsvProducts(...)` and then fires a bare `loadData()`.
The reviewer's own reasoning for treating it as harder — per-row partial
persistence, since `createCsvProducts` loops over rows — does not hold, and
for the same reason the five siblings' original "partial-mutation" deferral
did not hold: `ProductOfflineService.createCsvProducts`
(`product-offline-service.ts:247`) iterates via a synchronous `forEach` with
no `await` inside it, so the DEK cannot change state mid-loop. Either it is
present for the whole loop (every row attempts its own domain-level
create/skip, no throw), or it is absent from the start (the first row's
write throws immediately and native `forEach` aborts before any later row is
attempted, before any `localStorage.setItem` runs).

There IS an `await` between the two loops
(`await productService.createCsvProducts(...)`) — an `await` alone does not
rule out an interleaving timer, and the idle-lock timer
(`app-layout.tsx:58`) really does call `logout()` → `clearDek()` across one.
What rules it out here specifically is that `createCsvProducts` itself
contains no `await` in its own body (confirmed above), so its returned
promise settles in the same microtask checkpoint the caller's `await`
resumes in — and a `setTimeout` callback cannot run inside a microtask
checkpoint; it waits for the next macrotask. So control returns to
`handleCsvImport`'s second loop before any timer gets a chance to run,
carrying the same DEK state `createCsvProducts` itself observed. The second
loop (`inventoryService.createInventoryEntry(...)` per created row) is the
same synchronous, no-`await` shape as the first, so once inside it the same
guarantee applies again. This chain is specific to `handleCsvImport` — it is
the only handler in this file where the guarded mutation spans an `await`
before doing its own writes — and is worth re-checking if `createCsvProducts`
or `createInventoryEntry` ever gain an internal `await` (e.g. under
`GlobalConfig.USE_ONLINE_SERVICE`, where the HTTP path genuinely suspends).
This handler is guarded with the same two-guard shape as the five siblings;
see the plan's Task 5.

## Out of scope

- The other 17 authenticated routes with the same unguarded pattern. Noted
  above; each needs its own review of what its empty state means.
- Redirecting to `/login?unlock=1`. Rejected in the brainstorm — see
  "Decisions" above.
- Changing `authLoader`, the idle-lock timer, or `needsUnlock()`. Those are
  the existing, working navigation-time gate; this change only covers the
  gap they cannot cover (an already-mounted page).
- The data-loss hazard in `product-category-repository.ts:237-247`: its
  `catch {}` swallows *every* decrypt failure, including a GCM tag failure
  with a still-*valid* DEK (corrupt ciphertext), then writes an empty map
  back over storage. That is a different failure class from a missing DEK —
  it needs its own design decision (what should happen when decryption fails
  with a valid key present?) — and is unrelated to `MissingDataKeyError`.
  Noted here so it is not lost; not touched by this change.

`handleClearData`'s existing three-way error handling
(`products.tsx:328-378` before this change's edits) stays exactly as it was
written — the two mutation/repaint guards added to the five sibling handlers
follow its established `succeeded`-flag idiom, they do not replace it, and
this change adds no new call inside `handleClearData` itself.
