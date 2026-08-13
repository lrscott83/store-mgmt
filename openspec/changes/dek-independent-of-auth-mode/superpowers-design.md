# Design — Encryption independent of the authentication mode

## The problem, in plain words

The app encrypts everything it stores locally with a per-store key. That key is
derived by the backend and travels to the device inside exactly one vehicle: the
**offline roster bundle**, which is a feature of offline authentication and is
gated behind administrator permissions.

So encryption ended up welded to one authentication mode. Three consequences, all
of them live today:

1. **A normal user logging in online never receives the key.** The endpoint that
   carries it requires user-administration permission.
2. **When the app cannot find a key, it invents one.** A random 32-byte key,
   minted on the device, that the server has never seen and can never re-derive.
   Everything written under it is unrecoverable by anyone, forever.
3. **When the app cannot read data, it overwrites it with an empty value.** All
   six business entities do this, so an unreadable-but-intact store becomes an
   empty one.

Nothing surfaces any of this. A decryption failure is silent, and the one place
that detects a key conflict writes it to the browser console.

Asked the other way round — *how would the app behave if offline authentication
had never been built?* — it would encrypt every store with a device-invented key
and offer no recovery at all. The only reason recovery exists today is that the
roster dragged the server's key along with it.

## The business rules this change must satisfy

Stated by the product owner, in order of authority:

1. **Encryption is independent of the authentication mode.** The key must not
   depend on whether you signed in online, offline, or by importing a roster.
2. **Data is never deleted.** Not on a failed read, not on a failed unlock, not
   to make an error go away.
3. **Data is always recoverable** — by importing a new roster, or by
   authenticating online.
4. **Failures are announced.** A decryption failure shows a message and signs the
   user out; a device that cannot open its own data is not allowed in.

Rule 4 gives rule 3 its escape route: every failure lands the user on the login
screen, which is where a roster can be removed, another imported, or an online
session started.

## What was verified in the code

Every claim below was read in the source, not assumed.

| Fact | Where |
|---|---|
| The store key is **derived, never stored**: HKDF over a server master secret plus the store id. Same store, same key, always. | `backend/src/Application/Services/Authentication/StoreDataKeyProvider.cs:17-21`, asserted by `StoreDataKeyProviderTests.GetDek_same_storeId_returns_same_dek` |
| The **only** producer of a wrapped key is the roster export. | `ExportOfflineRosterQuery.cs:96,120` — the sole caller of `WrapDek` in the backend |
| That endpoint is **administrator-only**, twice over: a controller-level permission and a handler-level role check. | `StoreUsersController.cs:17`, `ExportOfflineRosterQuery.cs:79` |
| Neither the login response nor the current-user response carries any key field. | `Dtos/Authentication/AuthDto.cs`, `Dtos/Authentication/CurrentUserDto.cs` |
| Online and offline login resolve the key through the **same** function, which reads **local sources only** — device table, then roster, then mint. | `auth-store.ts:297-298` and `:326-327` → `dek-provisioning.ts:67-167` |
| The mint is a random local key. | `dek-provisioning.ts:161-166` |
| A local-vs-roster key disagreement is detected and only logged. | `dek-provisioning.ts:191-206` |
| Once a local key is device-wrapped, the roster is never consulted again — step 1 recovers the local key and the roster branches are skipped. | `dek-provisioning.ts:76-110` |
| All six business entities swallow a failed read and write an empty value over it. | `product-category-repository.ts:237-249`, `product-repository.ts:421-432`, `order-offline-service.ts:601-612`, `inventory-offline-service.ts:950-961`, `sale-credit-offline-service.ts:395-406`, `expense-offline-service.ts:280-291` |
| The device-local key copy is best-effort: it lives in IndexedDB and its creation returns `null` on any failure. | `device-key-store.ts:137-158` |
| Wiping a store's data needs no key — it only removes keys from storage. | `store-data-reset.ts:33-43` |

The last row matters: the existing "Limpiar" action stays available as a
deliberate, user-confirmed reset even when nothing can be read.

## The backend contract this design assumes

Handed to the backend team as a separate work item. This design treats it as
given, and the frontend degrades safely while it is absent.

The **login response** (`AuthDto`) gains three fields, identical in meaning and
format to the ones the roster already carries per user:

- `wrappedDek`
- `wrapSalt`
- `wrapIv`

Rules the backend was given:

1. Reuse `StoreDataKeyProvider.GetDek(selectedStoreId)` and
   `StoreKeyWrapService.WrapDek(preHash, dek)`. The wrap must be byte-compatible
   with the roster's, because the frontend unwraps both with the same code.
2. Available to **every authenticated user**, with no administrative permission.
3. Produced **after** the login's existing `OfflinePasswordPreHash` backfill, so a
   user's very first login also receives the key.
4. If the wrap cannot be produced, return the three fields empty rather than
   failing the login.
5. Additive — the roster export and its format do not change.

## Frontend design

### D1 — The key has exactly one origin: the server

`resolveDekForLogin` keeps its ordered resolution, with one branch removed and
one added:

1. A device-key wrap already recovered this page load.
2. This login's own entry in the device table.
3. The **login response's wrap** (new — the online path).
4. The roster's wrap for this login.
5. ~~Mint a random local key~~ → **`DekUnwrapError`**.

Sources 3 and 4 both carry the server-derived key, so they agree by
construction. This is the whole of rule 1: the key no longer depends on which
door the user came through.

### D2 — The app never invents a key

The mint disappears with no conditional replacement. A device that cannot obtain
the server's key does not proceed, which is rule 4 and prevents rule 3 from ever
being violated in the future: no data is ever written under a key the server
cannot re-derive.

This is a deliberate behaviour change for one case — a device with no roster, no
device wrap and no login-response wrap previously entered and started writing
under an invented key. It now refuses. Refusing destroys nothing; the previous
behaviour destroyed silently.

### D3 — The server's key wins over a stale local key

The reconciliation that today only logs (`dek-provisioning.ts:191-206`) becomes
an action: when the key recovered locally disagrees with the one the server
supplied (via login response or roster), the **server's key is adopted** and the
device table is rewritten. The conflict marker and the log line stay for
forensics.

Without this, importing a fresh roster onto a device that once minted locally is
a no-op, and rule 3's "recoverable by importing a new roster" is untrue.

### D4 — A failed read never writes

In each of the six entity read paths, the `catch`-then-write becomes a
three-state decision at the storage boundary:

- **Key absent from storage** → genuinely a new store → auto-initialise by
  writing an empty value. Unchanged; this is the case where the write is honest.
- **Key present and readable** → parse and return. Unchanged.
- **Key present and unreadable** (missing data key, GCM tag failure, corrupt
  JSON) → **propagate, write nothing**.

The auto-init write survives only for the case that always deserved it. Since
every mutation reads before it writes, propagating on the read also blocks the
mutation — no separate write guard, no new per-repository state.

The shared three-state decision lives in one helper under
`shared/lib/storage/`, consumed by all six, mirroring how
`runGuardedAgainstMissingDek` was introduced.

### D5 — One global policy, not twenty guards

A decryption failure that reaches the UI shows a blocking message and signs the
user out. One policy at the boundary, rather than a guard at each of the ~20
authenticated routes that read entity storage.

**The seam is two listeners, not a wrapper per route.** D4's failures arrive by
two routes and both must be covered: a throw during render or inside a loader,
caught by a root-level error boundary; and a rejected promise from an event
handler or an effect, caught by a `unhandledrejection` listener registered once
at app start. Both funnel into the same handler, which inspects the error type,
picks the message, and calls `logout()`. Any error that is not a decryption
failure passes through untouched — this handler must never become a catch-all.

This replaces `runGuardedAgainstMissingDek` at the eight `products.tsx` call
sites that currently use it: with a global policy, a per-call-site guard would
show two messages for one failure. Removing it is part of this change, not a
follow-up.

Sign-out lands on `/login`, which is precisely where rule 3's two recovery
routes already live: the offline-access panel removes a roster, the import modal
adds one, and an online sign-in fetches the key.

Two messages, because two failures deserve different truths:

- **No key / wrong key** → recoverable. The message says so and points at signing
  in online or importing a roster.
- **Damaged bytes** (valid key, GCM tag failure) → not recoverable by any key.
  The message says the data could not be read and that nothing was deleted. It
  must not promise a rescue that cryptography cannot deliver.

### D6 — The login refuses when it cannot open the device's data

A device holding `enc:v1:` values it cannot decrypt does not authenticate. The
typed error already exists (`DekUnwrapError`) and the login route already has a
gate (`guestOnlyLoader`); this extends the gate rather than inventing a mechanism.

## What this design cannot deliver

If stored bytes are damaged — a GCM tag failure with the correct key — **no key
recovers them**. There is nothing to decrypt. Rule 3 cannot hold for that case,
and the design does not pretend otherwise: the data is left untouched, and the
message tells the truth. Rule 2 still holds in full.

## Testing

### Unit

Each of the six read paths gets the three-state behaviour pinned: absent key
auto-initialises, readable key parses, unreadable key propagates **and writes
nothing** (asserted by comparing raw stored bytes before and after).

`resolveDekForLogin` gets: adopts the login-response wrap; adopts the roster wrap;
prefers the server key over a disagreeing local key; throws instead of minting.

### End-to-end (all new — no existing E2E test or support file is modified)

1. Import a roster, create data, **delete the roster, import another** → the data
   is visible.
2. Import a roster, create data, **delete the roster, sign in online** → the data
   is visible.
3. Create data signed in **online**, then sign in **offline** → the data is
   visible. And the reverse. *This is the one test that proves rule 1 on its own.*
4. After a decryption failure, the stored bytes are **byte-for-byte identical** to
   before the attempt. *This is the only assertion that actually proves rule 2.*
5. A decryption failure while signed in → message shown and session closed.
6. A device holding data it cannot open → login refused, reason shown, data intact.

Tests 2 and 3 exercise the login-response wrap and therefore need the backend
contract in place. Tests 1, 4, 5 and 6 do not.

**Test fixtures.** Today's E2E rosters are synthetic bundles built from a pinned
known-answer file, not bundles issued by the running backend. A test that claims
"delete the roster, sign in online, see the data" only proves rule 3 if the data
was written under the key the real server derives, so tests 2 and 3 must obtain
their roster from the backend rather than from the fixture.

## Delivery

Two stages, because the first depends on nobody.

**Stage 1 — frontend only.** D2, D3, D4, D5, D6 and E2E tests 1, 4, 5, 6. This
closes the data-loss defect completely and satisfies rules 2 and 4, plus the
roster half of rule 3.

**Stage 2 — after the backend contract lands.** D1's login-response source and
E2E tests 2 and 3. This completes rule 1 and the online half of rule 3.

Until stage 2, a device with no roster and no device wrap cannot sign in. That is
a worse experience than today's silent invention of a key, and a strictly better
outcome: nothing is destroyed.

## Out of scope

- Backend implementation of the login-response contract — a separate work item.
- Backing up or quarantining damaged ciphertext. No key recovers damaged bytes;
  a backup copy is a product decision of its own.
- The ~20 authenticated routes' individual empty-state semantics. D5 replaces the
  per-route guard approach entirely.
