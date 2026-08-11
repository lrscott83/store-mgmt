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

`script-src` MUST equal `'self'` only, on both the dev header and the
production policy text, and MUST NOT contain `'unsafe-inline'` or
`'unsafe-eval'`. This directive guards the DEK; a regression here reopens
the XSS hole this change exists to close.

#### Scenario: script-src is strict on both surfaces

- GIVEN the dev header and the production policy text
- WHEN each surface's `script-src` value is inspected
- THEN it equals `'self'` only, with no `'unsafe-inline'` or `'unsafe-eval'`

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

Navigating the app's primary routes with the policy active MUST NOT raise
any `securitypolicyviolation` event — the directive set must be complete for
real usage, not merely present.

#### Scenario: Zero violations across primary routes

- GIVEN a `securitypolicyviolation` listener registered before navigation
- WHEN the app's primary authenticated routes are visited in sequence
- THEN zero `securitypolicyviolation` events are observed
