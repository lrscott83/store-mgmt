# pwa-precache-build Specification

## Purpose

Build-time generation and verification of the service-worker precache
manifest for `web-store-pos`. This is the automated gate that replaces the
missing end-to-end offline test: it proves the manifest is complete and
fails the build otherwise. No runtime behavior is specified here (see
`pwa-offline-shell`).

## Requirements

### Requirement: Manifest injection runs after the client build

`injectManifest` MUST run as a distinct build step AFTER React Router (SPA,
`ssr:false`) has finished writing `index.html` and the hashed route-manifest
chunk (`assets/manifest-<hash>.js`) to disk. The build script MUST NOT rely
on `vite-plugin-pwa`'s in-build `closeBundle` injection.

#### Scenario: Injection step observes finished output

- GIVEN a completed `react-router build` producing `build/client/`
- WHEN the precache injection step runs
- THEN it globs `build/client` AFTER `index.html` and `assets/manifest-<hash>.js` already exist on disk

### Requirement: Precache manifest contains the app shell

The generated precache manifest MUST contain exactly one entry for
`index.html` and exactly one entry for the hashed route-manifest chunk
(`assets/manifest-<hash>.js`).

#### Scenario: Shell present exactly once

- GIVEN a built service worker bundle
- WHEN the precache manifest is inspected
- THEN it contains `"url":"index.html"` exactly once
- AND it contains exactly one `assets/manifest-*.js` entry

#### Scenario: Missing shell fails the build

- GIVEN the precache manifest omits `index.html` or contains zero
  `assets/manifest-*.js` entries
- WHEN the build-gating verification step runs
- THEN the build process exits non-zero and no artifact is published

### Requirement: Manifest contains exactly the offline route closure

The precache manifest MUST contain exactly the URLs resolved from the built
route manifest: for every route id in `OFFLINE_ROUTE_IDS`
(`scripts/precache-patterns.mjs`) its module, its `imports`, its `css` and the
same for each ancestor in the `parentId` chain, plus the entry module/imports,
plus the transitive import graph walked on disk (static and dynamic imports),
plus the declared static families (`*.html`, `manifest.webmanifest`,
`favicon.png`, `icons/*.png`, `images/**/*.png`, `fonts/**/*.woff2`), plus the
local assets the precached HTML documents reference (root-level
`pwa-install-capture.js`, the landing page's externalized `bootstrap-*.js`), and
the hashed route-manifest chunk. A route that is not in that list MUST NOT be
precached. The route list, the static patterns and the forbidden chunk prefixes
MUST live in one shared module consumed by both the injector and the verifier
(the verifier additionally reads the forbidden prefixes).

#### Scenario: Planned asset absent from the manifest fails the build

- GIVEN an asset the plan resolved from the route manifest or the static
  families
- WHEN that asset has no corresponding entry in the injected manifest
- THEN the build-gating verification step fails and reports the missing path

#### Scenario: Unplanned asset in the manifest fails the build

- GIVEN an entry in the injected manifest that the plan did not resolve
- WHEN the verification step runs
- THEN the build fails and reports the extra URL, because the install is
  downloading something nobody declared

#### Scenario: Online-only chunk reaching the manifest fails the build

- GIVEN a chunk whose name matches `FORBIDDEN_PRECACHE_PREFIXES` (web catalog,
  online orders, management, profile, admin)
- WHEN it appears in the injected manifest
- THEN the build fails: a plan-versus-injection comparison cannot catch this on
  its own, because both sides would agree

#### Scenario: Offline route id that no longer exists fails the build

- GIVEN a route module renamed or removed while its id stays in
  `OFFLINE_ROUTE_IDS`
- WHEN the plan is resolved
- THEN the build fails naming the unknown route id, instead of silently
  precaching a smaller set

#### Scenario: File outside the closure is not required

- GIVEN a file on disk that neither the route closure nor the static families
  reference (a source map, the SSR `server-build-*` leftovers, an online-only
  route chunk)
- WHEN the verification step runs
- THEN its absence from the manifest does NOT fail the build

### Requirement: Exactly one injection point in the worker bundle

The service-worker bundle passed to `injectManifest` MUST contain exactly one
occurrence of the `self.__WB_MANIFEST` placeholder before injection. Bundling
(e.g. minification) MUST NOT duplicate or inline this placeholder into
multiple locations.

#### Scenario: Single placeholder occurrence

- GIVEN the pre-injection service-worker bundle
- WHEN the placeholder is counted
- THEN `self.__WB_MANIFEST` occurs exactly once

#### Scenario: Multiple occurrences fail the build

- GIVEN a bundling change causes `self.__WB_MANIFEST` to appear more than once
- WHEN `injectManifest` runs
- THEN the build fails loudly (does not silently pick one occurrence)

### Requirement: Verification step is a mandatory build gate

The verification step (asset completeness + shell presence + single
injection point) MUST run as part of `pnpm build` (and therefore any
container image build using the same command), not only as an optional or
manual script.

#### Scenario: Clean checkout build enforces the gate

- GIVEN a clean checkout with no manual steps run
- WHEN `pnpm build` executes
- THEN the verification step runs automatically as part of that command
- AND an incomplete manifest fails the overall build with a non-zero exit code

### Requirement: Dead manifest-fetch path is absent

No build step MUST emit `assets-manifest.json` or any equivalent
runtime-fetched manifest artifact. No application code MUST reference or
depend on such a file existing.

#### Scenario: No dead manifest artifact is produced or referenced

- GIVEN the completed build output and application source
- WHEN searching for `assets-manifest.json` or `PRECACHE_APP_CHUNKS` across
  build output and `app/`
- THEN no matches are found
