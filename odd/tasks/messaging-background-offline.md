# messaging-background-offline

## Objective

Make every owner-facing messaging request non-blocking (background/async), so
messaging never shows a global loading overlay, never blocks any app feature and
never surfaces an error toast when the device is offline. Offline sends stay
allowed and are persisted locally, that local queue is included in the
export/import backup, and the message composer becomes an auto-growing textarea
(two visible rows minimum).

## Problem

The owner header chat (`MessageShell`) currently drives foreground HTTP calls
that flip the global loading overlay and toast on failure:

- Mount / online transition calls `refresh(false)` → `getConversations()` without
  `skipLoading` (global overlay), and its `catch` shows `MESSAGES.LOAD_ERROR`.
- Tapping the chat icon calls `refresh(true)` foreground → overlay.
- Read receipts call `markAsRead(id)` and a follow-up `getConversations()`
  foreground → overlay.
- `handleSend` posts without background config and holds an `isSending` state.
- Offline, a foreground request that hangs/fails leaves the experience looking
  stuck loading.
- The composer is a single-line `<input>`; long messages cannot be reviewed.
- The offline outgoing queue (`messagesQueue`) is persisted per store but is NOT
  part of the sync backup (export/import), so unsent messages are lost on a
  backup/restore.

## Why

A chat widget mounted in the global header must never gate the rest of the app.
Offline is an expected state, not an error. The local queue must survive a
backup/restore like every other per-store business entity.

## Scope

In scope (React frontend only — `frontend-react/`):

- `app/shared/lib/messages/messages-http-service.ts`
- `app/shared/components/message-shell.tsx`
- `app/shared/components/__tests__/message-shell*.test.tsx`
- `app/admin/messages/routes/messages.tsx` + its unit test (message requests
  only, not the owners/stores directory load)
- `app/shared/lib/messages/messages-offline-service.ts` (+ tests)
- `app/sync/lib/services/data-serializer-service.ts` (+ tests)
- `app/sync/lib/services/data-synchronizer-service.ts` (+ tests)
- `app/sync/routes/export.tsx`, `app/sync/routes/import.tsx`
- `app/shared/lib/i18n/es.ts` (only if a new string is needed)

Out of scope / forbidden:

- `frontend/` (Angular legacy) — never read or touch.
- Any `frontend-react/e2e/**` spec or support file — untouchable.
- Backend source and backend E2E tests.

## Constraints

- JSON payloads / persisted bookkeeping must remain standard `camelCase`; the
  `messagesQueue` wire shape stays `{ id, conversationId, ownerId, storeId,
  content, queuedAt }`.
- Keep the offline zero-request invariant: while `navigator.onLine` is false the
  shell must issue NO network request (login-offline E2E depends on it).
- Existing unit tests may be updated only where behavior intentionally changes;
  E2E tests are never modified.
- No new dependency.

## Tasks

### T1 — HTTP service: background-capable send

Add an optional `MessagesRequestOptions` argument to `sendMessage` so it can
POST with `skipLoading` (`apiClient.post(url, payload, SKIP_LOADING)`), keeping
the one-argument call shape when no option is passed.
Acceptance: unit test proves `{ background: true }` → `skipLoading` config; the
no-option call stays `post('/v1/messages', payload)`.

### T2 — MessageShell: fully background, no load toast, offline-safe

- `refresh` always fetches background (`getConversations`/`getMessages` with
  `{ background: true }`) and never calls `showToastError` on load failure.
- `handleToggle` opens the panel and refreshes in background (no overlay).
- `markVisibleIncomingAsRead` uses background `markAsRead` + background
  `getConversations` follow-up.
- `flushQueue` sends with `{ background: true }`.
- `handleSend`: no global loading, no `isSending`-driven blocking; clears the
  composer immediately; offline or network failure enqueues locally (queue toast
  preserved); non-network server failure keeps `MESSAGES.SEND_ERROR`.
- Offline keeps the zero-request invariant.
Acceptance: shell unit tests updated to the background call shapes; the "load
error toast" test now asserts NO toast; offline test still passes.

### T3 — MessageShell: auto-growing textarea composer

Replace the single-line `<input>` with a `<textarea rows={2}>` that wraps and
auto-grows with its content (min 2 rows), so the whole message is always
readable. Enter sends; Shift+Enter inserts a newline. Keep the
`MESSAGES.INPUT_PLACEHOLDER` aria-label and placeholder.
Acceptance: shell test asserts the composer is a textarea with `rows="2"`; a
long value does not clip (auto-grow effect present).

### T4 — Admin messages page: background message requests

`refreshThreads` / `loadMessages` / `handleSend` use the background request
shapes and no longer toast on load failure. The owners/stores directory load is
unchanged.
Acceptance: admin messages unit test updated for the background send shape.

### T5 — Offline queue: import seam

`MessagesOfflineService.addImportedQueuedMessage(message)` appends a queued
message when its `id` is not already present (skip on duplicate), reviving
`queuedAt` from a string. Expose a reader for the sync export
(`getStorageMessagesQueueJson()` mirroring the channel-rate seam) if convenient.
Acceptance: new service test proves append + duplicate skip + date revival.

### T6 — Serializer: messages-queue entry

Add `EDataFileName.MessagesQueue = 'messages-queue.json'`, an optional
`MessagesQueueReader` constructor seam, an export entry always written (empty
array when no reader), `ParsedData.messagesQueue?: QueuedMessage[]` (optional
for legacy literals), parse in `parseContents` (absent → `[]`), and include it
in `exportPlainData`.
Acceptance: serializer tests updated — entry count/lists now include
`messages-queue.json`; round-trip parses queued rows; legacy archive → `[]`.

### T7 — Synchronizer: messages-queue merge

Add an optional `MessagesQueueImportService` seam
(`addImportedQueuedMessage`) and merge `data.messagesQueue` when the service is
present (append/skip-on-duplicate, entity name `messagesQueue`).
Acceptance: synchronizer test proves insert + duplicate skip and merge entry.

### T8 — Route wiring

`export.tsx` and `import.tsx` construct `MessagesOfflineService(storeId)` and
pass it as the new final argument to the serializer and synchronizer.
Acceptance: typecheck + existing sync route tests pass.

### T9 — Verification & commits

Run `pnpm typecheck` and the affected Vitest suites; commit per work unit.

## Delivery strategy

`ask-on-risk` (default). Forecast ~450 authored changed lines across two work
units; if the running count crosses ~400 before the next commit, ask once for a
chain strategy (`stacked-to-main` or `feature-branch-chain`).

## Route

Delegated direct: two bounded writers under ODD (T1–T4, then T5–T8), parent
coordinates verification and commits.

## Progress

- [x] T1 — `sendMessage(payload, { background: true })` → `post(url, payload, SKIP_LOADING)`; default stays `post(url, payload)`. `messages-http-service.test.ts` 11/11 pass (vitest, 2026-10-05).
- [x] T2 — shell `refresh`/`markVisibleIncomingAsRead`/`flushQueue`/`handleSend` all background, no load toast, `isSending` removed. `message-shell*.test.tsx` 24/24 pass (vitest, 2026-10-05).
- [x] T3 — composer is `<textarea rows={2}>` with auto-grow effect + Enter/Shift+Enter. TEXTAREA/rows test passes (vitest, 2026-10-05).
- [x] T4 — admin `loadMessages`/`refreshThreads`/`handleSend` background, no load toast, `isSending` removed; `loadDirectory` unchanged. `messages.test.tsx` 7/7 pass (vitest, 2026-10-05).
- [x] T5 — `MessagesOfflineService.getStorageMessagesQueueJson()` + `addImportedQueuedMessage` (append, duplicate skip, empty-content `Result.Failure`, date revival). `messages-offline-service*.test.ts` 24/24 pass (vitest, 2026-10-05).
- [x] T6 — `EDataFileName.MessagesQueue='messages-queue.json'`, optional `MessagesQueueReader`, `ParsedData.messagesQueue`, always-written entry, `parseContents` legacy → `[]`, `exportPlainData`. `data-serializer-service.test.ts` 52/52 pass (serializer tests now assert 14 data entries + round-trip/legacy/plain).
- [x] T7 — optional `MessagesQueueImportService`, append-only `mergeMessagesQueueViaService` (oldest→newest, skip-on-duplicate, break-only `MessagesQueueUnexpectedError`). `data-synchronizer-service.test.ts` 39/39 pass.
- [x] T8 — `MessagesOfflineService(storeId)` wired into `export.tsx` (both export paths) and `import.tsx` (serializer + synchronizer, one instance). `sync/routes/__tests__` 18/18 pass.
- [x] T9 — WU2 verification: 8 suites, 138/138 pass, `pnpm typecheck` exit 0 (2026-10-05).

## Review note (RDD)

- WU1 (`26bcfaef`) was assessed by native RDD: `review_due=true` (`slice_budget_reached`, medium), consent granted by the user, review frozen (lineage `review-8751bae352763961`, one lens `review-reliability`).
- The OpenCode reviewer transport is **unavailable** in this install: the managed plugin sends a relay frame the installed transport rejects (`the V2 relay start must name the host agent dispatched for the Task`); `gentle-ai doctor` reports installed assets match 4.0.0. No sanctioned path exists to produce the reviewer artifact, so no PASS was fabricated.
- **User decision (2026-10-05): continue without the review.** WU1's review transaction remains unacknowledged; no review authority is produced. Delivery is a separate human decision under ordinary repository policy.
- WU2 is not re-entered into RDD per the same user decision.

## Next step

Feature complete pending commit of WU2. Push/PR remain the user's decision.
