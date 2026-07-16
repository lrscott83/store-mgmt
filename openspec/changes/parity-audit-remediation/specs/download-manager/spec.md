# Download Manager Specification (New Capability)

## Purpose

Add PWA install/update download-progress tracking + UI, mirroring Angular's
`DownloadManagerService` (`_services/download-manager/download-manager.service.ts`): the app
currently posts `PRECACHE_APP_CHUNKS` to the service worker with no progress feedback; this adds
observable `progress`/`isDownloading` state driven by service-worker messages, plus a UI that
displays it.

## Requirements

### Requirement: Service Worker Messages Drive Progress State
The manager MUST listen for `serviceWorker` `message` events and update state per message `type`,
mirroring Angular's `handleServiceWorkerMessage`:
- `INSTALLING` → `isDownloading = true`, `progress = 0`.
- `DOWNLOADING` (payload `{ downloaded, total }`) → `progress = round((downloaded/total) * 100)`.
- `INSTALLED` → after a short delay, `isDownloading = false`, `progress = 100`.

#### Scenario: DOWNLOADING message updates progress percentage
- GIVEN a service-worker message `{ type: 'DOWNLOADING', payload: { downloaded: 25, total: 100 } }`
- WHEN it is received
- THEN `progress` becomes `25` and `isDownloading` is `true`

#### Scenario: INSTALLED message settles at 100 then clears downloading flag
- GIVEN a service-worker message `{ type: 'INSTALLED' }`
- WHEN it is received
- THEN `progress` reaches `100` and, after a short delay, `isDownloading` becomes `false`

### Requirement: Progress State Is Observable By The UI
`progress`, `isDownloading` (at minimum) MUST be exposed as reactive/observable state consumable by
a React UI component, so a progress indicator can subscribe and re-render as values change (React
idiom substitute for Angular's `BehaviorSubject`-backed `Observable`s — rule 5).

#### Scenario: UI reflects live progress updates
- GIVEN a mounted download-progress UI component
- WHEN `progress` changes from `0` to `50`
- THEN the component re-renders showing the updated percentage without a manual refresh

### Requirement: startDownload/completeDownload Are Exposed
The manager MUST expose `startDownload()` (resets `isDownloading = true`, `progress = 0`) and
`completeDownload()` (`progress = 100`, then after a delay `isDownloading = false`) as explicit
triggers, mirroring Angular's public methods of the same name, for callers that drive progress
without relying solely on service-worker messages.

#### Scenario: Manual start resets progress
- GIVEN `isDownloading` is `false`
- WHEN `startDownload()` is called
- THEN `isDownloading` becomes `true` and `progress` resets to `0`
