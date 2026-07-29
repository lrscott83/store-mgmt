# Archive Report — offline-auth-frontend

Date: 2026-07-29
Branch: `feat/offline-auth-frontend`
Verify verdict: **PASS WITH WARNINGS**, 0 CRITICAL (`verify-report.md`, engram #1624)
Archive decision: taken by the user with Task 13 knowingly unexecuted.

## What this change delivered

A device can authenticate against a locally-imported encrypted roster bundle when
`isRosterProvisioned()` is true. This is a **mode switch, not a connectivity fallback**:
the roster file decides, and it is asked before any credential is evaluated. A device
without a roster stays byte-for-byte unchanged.

Implementation commits: `f2a9910..b962a96` on `feat/offline-auth-frontend`.

## Gates at archive

Independently re-executed, not copied from the apply report:

- `pnpm test` — 155 files / 2161 tests passed
- `tsc --noEmit` — clean
- `build` — succeeds, 136 SW precache entries

## Specs merged into the source of truth

| Capability | Action |
| --- | --- |
| `openspec/specs/offline-auth-mode/spec.md` | new capability |
| `openspec/specs/offline-roster-bundle/spec.md` | new capability |
| `openspec/specs/offline-device-provisioning/spec.md` | new capability |
| `openspec/specs/auth-session/spec.md` | merged in place — MODIFIED "Logout Storage-Clear Scope"; ADDED "loginOffline hydrates through the existing setUser seam" and "Idle lock scoped strictly to offline sessions" |

All pre-existing `auth-session` requirements were preserved unchanged.

## Open at archive — NOT closed by this change

Do not read this change as fully verified. Five items survive it:

1. **Task 10 (admin roster export) — BLOCKED-for-verification.** `GET
   /v1/storeusers/{storeId}/offline-roster` does not exist server-side. Unit tests prove
   only URL construction and `response.data.data` unwrapping against a mock. Response
   envelope, DTO casing, epoch-ms-vs-ISO dates, and whether `users[].verifier` exists at
   all are UNPROVEN. Tracked in `docs/plans/2026-07-28-backend-pending-work.md` §7a — a
   BACKEND item, out of scope here. The `BLOCKED-for-verification` comments in
   `roster-http-service.ts` and its test stay in place.
2. **Task 13 (manual smoke) — unexecuted.** All 9 steps in
   `docs/plans/2026-07-28-offline-auth-frontend-smoke-checklist.md`. Steps 13.1–13.3 are
   blocked on §7a (13.3 also on `pwa-offline-shell`'s pending manual DevTools
   walkthrough). **Steps 13.4–13.9 need no backend and can be run today.** Tracked as §7c.
   `tasks.md` item 13 is deliberately left unchecked.
3. **`web-store-pos` has no `eslint.config.js`** — the `lint` script cannot run even
   though the app already depends on `@store-mgmt/eslint-config`. Enforced gate is
   `tsc --noEmit`. Pre-existing project gap, needs its own change.
4. **Two `offline-auth-mode` scenarios remain PARTIAL-by-composition** — "An expired
   bundle falls back to online auth" and "Inactive roster user is rejected distinctly"
   now have end-to-end tests through the rendered form (commit `27403cf`), but the verify
   report's Spec Compliance Matrix was written before those landed. Recorded in
   `openspec/specs/offline-auth-mode/spec.md`'s Verification Status rather than silently
   upgraded.
5. **`verify-report.md` in this folder is a point-in-time artifact.** It reports the
   Batch-1 numbers (154 files / 2158 tests) and lists WARNING #1 and #2 as open. Both were
   closed afterwards by commits `6d2404a` and `27403cf`, moving the suite to 155/2161. The
   report was not rewritten retroactively — see the addendum appended to it.

## Traceability

Engram: explore #1615, proposal #1616, spec #1617, design #1618, tasks #1619,
apply-progress #1621, verify-report #1624, archive-report #1627.

## Learned

`sdd-archive` runs without a Bash tool, so it can merge specs but cannot perform the
folder move or the commit. Those two steps were completed by the orchestrator. Future
archive launches should expect a `partial` status and finish the move themselves.
