# Archive report — pwa-framework-parity (2026-07-15)

> Source of truth: Angular `frontend/src` vs React `frontend-react` + playbook (12 rules). No openspec/memory used as verdict.

## Delivered

| WU | Change | Mirror source | Commit |
|---|---|---|---|
| WU-1 | `preload-heavy-chunks.ts` util (fire-and-forget `import()` of admin-dashboard, statistics-dashboard, today-report), called from `login.tsx` success + `loaders.ts` `guestOnlyLoader` | Angular `preloading.service.ts` + `login.component.ts` `navigateToUserHome()` (2 call-sites) | `b0847cf` |
| WU-2 | Zustand `loading-store.ts` (request-count, clamp 0) wired into `api-client.ts` (start on request, stop on success + every error branch), renders existing `LoadingOverlay` from `root.tsx` | Angular `loading.service.ts` + `loading-interceptor.service.ts` (`finalize()`) + `app.component.html:2-6` | `1424f07` |

## Excluded (Angular dead-code — rule 10/12, code-verified)

- `download-manager.service.ts` — methods invoked but output never rendered (`app.component.html` binds none of its observables; `DownloadProgressComponent` selector used in 0 templates).
- `splash-screen.service.ts` / component / module — `SplashScreenModule` never imported, `app-splash-screen` in 0 templates.

Recreating either = rule-12 invention. Not ported.

## Verification

PASS (0 CRITICAL). Full suite 1656/1656, `tsc` clean. Both WUs verified 1:1 against Angular source; dead-code confirmed absent from React.

- 1 WARNING resolved post-verify: an invented defensive `try/catch` + request `onRejected` in `api-client.ts` (scope-creep beyond Angular, rule 2/12) was stripped so the request interceptor mirrors Angular exactly (start() + set header only). Re-ran suite → 1656/1656 green.

## Flow note

Interactive + hybrid. spec/design/tasks phases compressed (2 small concrete WUs, proposal carried acceptance criteria). No delta specs produced → nothing to merge into canonical specs.
