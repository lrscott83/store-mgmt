# Frontend — Work Queue

Date: 2026-08-04
Scope: `frontend-react/` only. Backend work is not tracked here.

Every item below was verified against source on 2026-08-04, not against the checkboxes in
the plans it references. None of those plans has a single ticked checkbox, and that has
never reflected reality in this repo — read the evidence lines, not the boxes.

Groups are units of SDD work: items inside a group share a blocker, a file set, or an
execution context, and are meant to be run as one change. Groups are ordered by priority.

## Resolved and deleted

These frontend plans were confirmed resolved in code and their files removed on 2026-08-04:
`2026-07-30-register-endpoint-fixes-frontend.md`, `2026-08-02-change-password-contract-frontend.md`,
`2026-08-02-owners-create-frontend.md`, `2026-08-02-owners-getall-frontend.md`,
`owners-update-endpoint-fixes-frontend.md`. Recoverable from git history.

**Group A — `owners-getbyid-envelope-404` — RESOLVED and removed from this queue on
2026-08-04.** Full SDD cycle, verify PASS (0 CRITICAL, 0 WARNING, 1 SUGGESTION resolved).
Branch `feat/owners-getbyid-envelope-404`, commits `05e4db2` (helper), `389c059` (load path),
`97de04b` (archive). `ownerErrorMessageId` now derives a status from either channel —
`error.response.status` or the envelope's `actionCode` when `succeeded === false` — and both
arms of the owner-edit load effect index one hoisted `LOAD_ERROR_KEYS` map. The delta was
merged into `openspec/specs/admin-owners-resellers/`; the archived artifacts live at
`openspec/changes/archive/owners-getbyid-envelope-404/`. Its source plan
`2026-08-02-owners-getbyid-frontend.md` was deleted with it.

Groups below keep their original letters, so B remains B — the priority numbers are what
shifted. Group C was deferred to LAST by the user on 2026-08-04, so it now sits after D
despite having no technical blocker.

---

## B — Offline manual acceptance (P1)

**Source plans:** `docs/plans/2026-07-28-offline-auth-frontend-smoke-checklist.md` (0 of 9 steps
run), `docs/plans/2026-07-27-pwa-offline-shell-frontend-plan.md` (Tasks 7 and 8)
**Blocked on:** a human with a browser. No browser automation exists in this repo.
**Not an SDD** — this is checklist execution plus one cleanup commit at the end.

Both features are already on `main`. Neither has passed the acceptance gate its own plan
defines.

Order matters: run the offline-auth smoke **first**. It exercises roster import and offline
login, which is the substrate the PWA shell renders on top of — a failure there would
explain a failure in the walkthrough.

- [ ] Re-read the 9 smoke steps against today's reality (the roster export endpoint shipped
      after that checklist was written) and run what survives.
- [ ] PWA Task 7 — the offline walkthrough: serve the production build off the dev port,
      activate the SW, then type-load public, app and admin routes with the network offline.
- [ ] PWA Task 8 — remove the 9 `console.info` calls marked TEMP in `app/service-worker.ts`
      and `app/shared/lib/pwa/service-worker-registration.ts`. **Requires explicit sign-off,
      and must come after the walkthrough** — those logs are the only visibility into the SW
      lifecycle while it runs.

---

## D — `offline-roster-contract-v3` (P2)

**Source plans:** `docs/plans/2026-07-25-at-rest-encryption-frontend-plan.md` (the KAT fixture),
`docs/plans/2026-08-04-offline-roster-billing-fields-frontend.md`
**Blocked on:** the backend. Do not start.

Both items touch the same bundle — `roster-types.ts`, the KAT fixture, `formatVersion` — and
both wait on backend plans that are unimplemented as of 2026-08-04:

| Item | Waits on | Evidence it has not shipped |
|------|----------|------------------------------|
| Replace the KAT fixture | `2026-08-02-offline-roster-dek-interop-backend-plan.md` Task 2 | `docs/contracts/` does not exist; no `StoreKeyWrapInteropTests.cs` |
| Billing fields + `formatVersion` 3 | `2026-07-30-offline-roster-billing-gate-backend-plan.md` Tasks 1-3 | `ExportOfflineRosterQuery.cs:33` still emits `FormatVersion = 2` |

The at-rest frontend code itself is complete and landed — `@noble/ciphers` 2.2.0,
`dek-unwrap.ts`, `entity-crypto.ts`, `entity-migration.ts`, the unlock gate. What is missing is
the proof: `app/shared/lib/offline/__tests__/__fixtures__/dek-kat.json` still declares
`"provenance": "node-transcription"` and `backendCommitSha: "UNKNOWN"`, and its own warning
says it proves nothing about backend interop. Writing frontend code against a v3 contract
before the backend emits one is writing against a contract that does not exist.

---

## C — `cash-session-pos` (P3 — LAST, deferred by the user on 2026-08-04)

**Source plan:** `docs/plans/sesion-de-caja-apertura-cierre-pos.md`
**Blocked on:** nothing technical. **Deferred by explicit user decision** — it goes last,
after every other group, including the backend-blocked one. Do not start it because it
happens to be unblocked.

Zero code exists: no match for `cashSession` / `openingBalance` / shift-opening anywhere in
`app/`. The document is survey and design (7 POS products compared, a per-shift state machine
proposed), and its §3.8 carries five open decisions that belong in the SDD's proposal phase.

Three of those five are already answered elsewhere in the same document, and were resolved on
2026-08-04 so a future session does not re-litigate them:

| §3.8 decision | Resolved | Where the document answers it |
|---|---|---|
| Blind count in v1 | No — deferred | §3.5: "toggle per store, OFF at the start, start simple" |
| Multi-device | Yes — two open sessions on two devices | §3.1 scopes the constraint to `device + storeId`, mirroring Odoo's `_check_unicity` |
| Close role | owner-admin | §3.5, already supported by `authorization-service` |

Still genuinely open, and they are product calls the user has to make — they change the data
model and the close gate:

- **Difference threshold** — fixed amount per store, a percentage of expected, or both?
- **Orphan session** — a shift left open overnight: force a manual count, auto-close, or
  auto-close only when the shift had no sales?
- **Denominations in v1** — single counted total, or the full bill/coin grid?

Largest group by far, and the only one that is a new feature rather than a fix.

---

## Not tracked here

`docs/plans/2026-08-02-pending-manual-verification.md` — the register of human-blocked steps.
Its PWA and offline-auth items are group B above; its remaining item (auditing the two stale
change folders in `frontend-react/openspec/changes/`, `frontend-parity-audit` and
`help-tutorial`) is housekeeping, not feature work.
