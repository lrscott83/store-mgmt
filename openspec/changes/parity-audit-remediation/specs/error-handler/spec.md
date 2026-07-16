# Error Handler Specification (New Capability)

## Purpose

Add global error capture equivalent to Angular's `GlobalErrorHandler`
(`_services/global-error-handler.service.ts`). Angular's zone.js patches `window.onerror` and
promise rejections so ALL uncaught errors (sync and async) funnel through one `ErrorHandler`; React
has no zone equivalent, so this capability explicitly wires `window.onerror` +
`window.addEventListener('unhandledrejection', ...)` to reach the same coverage React's existing
component `ErrorBoundary` (render/lifecycle errors only) does not provide.

## Requirements

### Requirement: Global Handlers Are Registered Once At App Boot
The app MUST register a `window.onerror` handler and a `window` `unhandledrejection` listener once
during startup, in addition to (not replacing) the existing React `ErrorBoundary`.

#### Scenario: Both listeners are active after boot
- GIVEN the app has finished booting
- WHEN inspecting global error coverage
- THEN both an uncaught-synchronous-error path (`window.onerror`) and an
  unhandled-promise-rejection path are wired to the handler

### Requirement: Network Errors Are Ignored (Not Surfaced To The User)
Mirroring Angular's `isNetworkError` check, an error whose message matches common network-failure
patterns (`"Failed to fetch"`, `"NetworkError"`, `"net::ERR"`, `"Network request failed"`, HTTP
status `0`) MUST be logged (console) but MUST NOT trigger the visible error UI.

#### Scenario: Fetch failure is logged but not shown
- GIVEN a rejected promise with message `"Failed to fetch"`
- WHEN the `unhandledrejection` handler processes it
- THEN it is logged via console but no error UI is displayed to the user

### Requirement: Non-Network Errors Surface A Visible Error UI
An uncaught error/rejection that is NOT classified as a network error MUST render a full-screen
error overlay showing the error message and (collapsed by default) its stack trace, with a close
button — mirroring Angular's `showErrorInUI` (message + collapsible stack + dismiss button).

#### Scenario: Non-network error shows the overlay
- GIVEN an uncaught error with message `"Cannot read property 'x' of undefined"`
- WHEN the global handler processes it
- THEN a full-screen overlay appears showing the message, with the stack trace available behind a
  toggle, and a button that dismisses it

#### Scenario: Overlay is dismissible and does not stack duplicates
- GIVEN the error overlay is already visible
- WHEN another non-network error occurs before the user dismisses it
- THEN the previous overlay is replaced (not duplicated) by the new one, mirroring Angular's
  existing-element-removal-then-recreate behavior

### Requirement: Handler Coexists With ErrorBoundary
The existing React `ErrorBoundary` (render/lifecycle errors) MUST remain unchanged and continue to
catch what it already catches; the global handlers add coverage for errors OUTSIDE React's render
cycle (event handlers, timers, promise rejections, `window.onerror`-reachable errors) that
`ErrorBoundary` cannot catch.

#### Scenario: Render errors still go through ErrorBoundary
- GIVEN a component throws during render
- WHEN the error occurs
- THEN `ErrorBoundary` catches it as before — the new global handlers do not intercept render-phase
  errors
