# Admin Features Specification

## Purpose

Bring the React `admin/features` page (web-store-pos) to structural (L5) and textual (L6) parity with Angular (`frontend/`), the source of truth, while keeping React's existing inline feedback mechanism and double-submit guard. No toast/notification infra is introduced; no dead Angular service methods or Angular text defects are replicated. The `activateFeatures` HTTP contract is unchanged (L4 parity already holds).

## Requirements

### Requirement: Features Page Card Shell

The features page MUST render its content inside the shared Card shell component, matching the structural pattern already used by the admin owners/resellers/stores card lists.

#### Scenario: Page renders inside Card shell
- GIVEN an admin navigates to `/admin/features`
- WHEN the page renders
- THEN the page content is wrapped by the shared Card shell component (not a flat `<div>`)

### Requirement: Activate Action as FAB with Icon

The "activate features" action MUST be rendered using the shared `Button` component's `fab` variant with an icon, replacing the plain iconless `<button>`.

#### Scenario: Activate control is a FAB
- GIVEN the features page has rendered
- WHEN the admin looks for the activate action
- THEN it is a `Button` with `variant="fab"` displaying an icon (not a plain unstyled button)

### Requirement: Inline Feedback Retained (No Toast)

The system MUST continue to render activation feedback as inline `<p>` elements (success and error), and MUST NOT introduce a toast/notification system.

#### Scenario: Successful activation shows inline success text
- GIVEN the admin clicks the activate FAB
- WHEN `activateFeatures` resolves with `succeeded=true`
- THEN an inline `<p>` renders the text "Las funcionalidades se activaron satisfactoriamente"
- AND no toast/notification is shown

#### Scenario: Failed activation shows inline error text
- GIVEN the admin clicks the activate FAB
- WHEN `activateFeatures` resolves with `succeeded=false`, OR the call throws
- THEN an inline `<p>` renders the text "Ocurrió un error inesperado activando las funcionalidades"
- AND no toast/notification is shown

### Requirement: Double-Submit Guard During Activation

The system MUST prevent a second `activateFeatures` HTTP call while a prior activation request is still in flight.

#### Scenario: Repeated clicks while loading do not duplicate the call
- GIVEN the admin has clicked the activate FAB and the request is in flight (`isLoading=true`)
- WHEN the admin clicks the activate FAB again before the first request settles
- THEN no second `activateFeatures` HTTP call is fired

#### Scenario: Guard releases after the request settles
- GIVEN a prior activation request has resolved or thrown
- WHEN the admin clicks the activate FAB again
- THEN a new `activateFeatures` HTTP call is fired

## Non-Requirements (Explicit Exclusions)

- MUST NOT build a toast/notification system; inline `<p>` feedback is the permanent mechanism for this page.
- MUST NOT add Angular's dead `feature.service` methods (`getFeatures`, `deleteFeature`, `getFeatureDetailsById`).
- MUST NOT replicate Angular's `GENERAL.RESPONSE.ERROR` non-existent-key defect or the `unb` typo in `FEATURES.UNEXPECTED_ERROR`.
