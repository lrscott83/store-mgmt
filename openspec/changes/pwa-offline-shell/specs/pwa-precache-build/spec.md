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

### Requirement: Manifest covers every file matching precache patterns

Every file under `build/client` matching the shared precache glob patterns
(scripts, styles, HTML, fonts, icons, webmanifest, images, favicon) MUST
appear in the injected manifest. Patterns and ignores MUST be defined in one
shared module consumed by both the injector and the verifier.

#### Scenario: On-disk asset absent from manifest fails the build

- GIVEN a file on disk matches the shared precache patterns
- WHEN that file has no corresponding entry in the injected manifest
- THEN the build-gating verification step fails and reports the missing file path

#### Scenario: Non-matching file is not required

- GIVEN a file on disk does NOT match any shared precache pattern (e.g. a
  source map)
- WHEN the verification step runs
- THEN its absence from the manifest does NOT fail the build

#### Scenario: The service worker never precaches itself

- GIVEN the built service worker (`build/client/service-worker.js`), which sits
  at the glob root and therefore matches the script pattern
- WHEN the verification step runs
- THEN its absence from the manifest does NOT fail the build, because the
  shared ignore list excludes it

Note: `injectManifest` adds `swSrc`/`swDest` to its own ignores internally, so
the worker is never in its own manifest. `getManifest()` — used by the
verifier — applies no such automatic ignore. Without an explicit entry in the
shared ignore list, the verifier reports `service-worker.js` as missing and
fails EVERY build.

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
