# Content Security Policy Specification

## Purpose

Defines the observable Content-Security-Policy-Report-Only behavior for
`web-store-pos`. Crypto (`device-wrapped-dek`) stops storage dumps; this
policy stops in-origin script from using the in-memory DEK as a decryption
oracle. Report-only only — enforcing mode is a future change.

## Requirements

### Requirement: Dev Header Delivery

The dev surface MUST serve a `Content-Security-Policy-Report-Only` response
header on document navigation, carrying `default-src`, `script-src`,
`style-src`, `font-src`, `img-src`, `connect-src`, `worker-src`,
`manifest-src`, `object-src`, `base-uri`, `form-action`, and
`frame-ancestors`.

#### Scenario: Header present with full directive set

- GIVEN the dev surface is running
- WHEN a client requests the app's root document
- THEN the response carries a `Content-Security-Policy-Report-Only` header
- AND its value contains all directives listed above

### Requirement: script-src Excludes Unsafe Keywords

`script-src` MUST permit exactly one source — `'self'` — on both the dev
header and the production policy text, and MUST NOT contain
`'unsafe-inline'` or `'unsafe-eval'`. This directive guards the DEK; a
regression here reopens the XSS hole this change exists to close.

`'report-sample'` is additionally declared and is NOT a violation of this
requirement: it is a reporting flag, not a source expression. It grants no
origin permission to execute anything; its only effect is that a violation
report carries the first ~40 characters of the offending script in
`SecurityPolicyViolationEvent.sample`. Without it the browser reports every
blocked inline script identically as `blockedURI: 'inline'`, which is too
coarse for the zero-violation sweep's allowlist to distinguish a known
dev-only script from a newly introduced one. Any FUTURE addition to
`script-src` that is a genuine source expression — a host, a scheme, a
nonce, a hash — is a change to this requirement and MUST be specced, not
slipped in.

#### Scenario: script-src is strict on both surfaces

- GIVEN the dev header and the production policy text
- WHEN each surface's `script-src` value is inspected
- THEN the only source it permits is `'self'`
- AND it contains neither `'unsafe-inline'` nor `'unsafe-eval'`
- AND the only other token present is the `'report-sample'` reporting flag

### Requirement: style-src Permanent Carve-out

`style-src` MUST include `'self' 'unsafe-inline'` on both surfaces — a
deliberate, permanent exception because a shipped production dependency
sets inline `style` at runtime for chart tooltip positioning. Not a
dev-only concession; not something a future edit should "tighten."

#### Scenario: style-src permits inline styles

- GIVEN the dev header or the production policy text
- WHEN its `style-src` value is inspected
- THEN it contains `'self'` and `'unsafe-inline'`

### Requirement: Report-Only Does Not Block

Violating the policy MUST NOT block the violating resource from loading or
executing, and MUST raise a `securitypolicyviolation` DOM event with
`disposition` equal to `"report"`.

#### Scenario: Violation is reported, not enforced

- GIVEN the app is loaded with the policy active
- WHEN a resource load violates a directive (e.g. a script sourced from a
  disallowed origin)
- THEN a `securitypolicyviolation` event fires with `disposition: "report"`
- AND the violating resource still runs

### Requirement: Dev/Prod Policy Parity

The dev-emitted and production-emitted policies MUST be identical
directive-for-directive except `connect-src`, which MAY differ to admit a
dev-only backend origin. Any other difference is a defect.

#### Scenario: Only connect-src differs

- GIVEN the dev header's directives and the production policy text
- WHEN every directive except `connect-src` is compared between them
- THEN all other directives are identical

### Requirement: No Violations on Real Routes

Navigating the app's primary **unauthenticated** routes with the policy
active MUST NOT raise any `securitypolicyviolation` event beyond a declared
allowlist of dev-only violations — the directive set must be complete for
real usage, not merely present.

Each allowlist entry MUST be narrow enough that a newly introduced inline
script does NOT match it: matching on directive and blocked-URI alone is
insufficient, because those are identical for every inline script. An entry
MUST also pin the violation's `sample` and MUST carry a written reason.

This narrowness is enforced **structurally, by the entry type** — an entry
cannot be constructed without an anchored `sample` pattern and a reason — and
by review. It has **no dedicated automated test**: the matcher lives in
`e2e/support/`, which `vitest.config.ts`'s `include` globs (`app/**`,
`scripts/**`) do not reach, and the Playwright suite exercises it only
against violations that actually occur. Closing that gap means moving the
predicate under `scripts/`; it is not done here and is not claimed to be.

**Authenticated routes are deliberately OUT of automated scope.** The
highest-risk runtime surfaces — chart tooltips, the blob-document PDF
export, CSV import, roster export — sit behind a login and are covered by a
manual console sweep, not by an automated test. This is a scoping decision,
not an oversight: the requirement above is what the suite enforces today,
and the enforcing change (separate, future) is what the manual sweep informs.

#### Scenario: Zero violations across primary unauthenticated routes

- GIVEN a `securitypolicyviolation` listener registered before navigation
- WHEN the app's primary unauthenticated routes are visited in sequence
- THEN every observed violation matches a declared dev-only allowlist entry
- AND no other `securitypolicyviolation` event is observed
