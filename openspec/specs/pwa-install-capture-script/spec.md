# PWA Install Capture Script Specification

## Purpose

Defines the observable contract of the script capturing
`beforeinstallprompt` for the install button. It moves out of an inline
`<script>` so `script-src` needs no `'unsafe-inline'`. Specified separately
because a future "modernise to `type=module`" change would pass the CSP
while silently breaking install capture.

## Requirements

### Requirement: Runs Before Hydration, Not Blocked by Policy

The capture script MUST run during initial document parse, before the app's
hydration bundle executes, and its load MUST NOT raise a
`securitypolicyviolation` event under a policy whose `script-src` is
`'self'` only.

#### Scenario: Prompt captured ahead of hydration

- GIVEN a `beforeinstallprompt` event is dispatched immediately after the
  capture script has loaded, before hydration completes
- WHEN the app finishes hydrating
- THEN `window.__pwaInstallPrompt` holds the captured event

#### Scenario: Script load produces no violation

- GIVEN the CSP is active with `script-src 'self'`
- WHEN the capture script's `<script>` tag loads
- THEN no `securitypolicyviolation` event fires for that load
