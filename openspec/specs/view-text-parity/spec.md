# View Text Parity Specification

## Purpose

Pure text-value localization parity: every user-facing string in the 6 listed React
views/components MUST render the exact Spanish text found in Angular's
`frontend/src/app/_modules/i18n/vocabs/es.ts` (source of truth), or — where Angular has
no equivalent string — a fixed, spec-defined Spanish string. No capability, behavior,
layout, or style changes are introduced by this spec.

## Requirements

### Requirement: Register page text parity

`app/auth/routes/register.tsx` MUST render the following Spanish strings, sourced
verbatim from Angular `register.component.html` + `es.ts` (line refs below).

| Element | Required text | Angular key (es.ts line) |
|---|---|---|
| Heading | `Creación de cuenta` | `REGISTRATION.WELCOME` (131) |
| Already-account text | `¿Ya tienes una cuenta?` | `REGISTRATION.ALREADY_ACCOUNT` (132) |
| Sign-in link | `Entra` | `REGISTRATION.SIGNIN_LINK` (133) |
| Full name label | `Nombre Completo` | `USER.FULL_NAME` (305) |
| Full name required error | `Nombre Completo es requerido` | `GENERAL.VALIDATION.REQUIRED` (232) interpolated |
| Login (username) label | `Usuario` | `GENERAL.LOGIN` (151) |
| Login required error | `Usuario es requerido` | `GENERAL.VALIDATION.REQUIRED` (232) interpolated |
| Password label | `Contraseña` | `GENERAL.PASSWORD` (152) |
| Password required error | `Contraseña es requerido` | `GENERAL.VALIDATION.REQUIRED` (232) interpolated |
| Password policy error | `La contraseña debe tener al menos 8 caracteres, un número y una letra en mayúscula` | `GENERAL.VALIDATION.PASSWORD_POLICY` (242) |
| Confirm password label | `Confirmar Contraseña` | `GENERAL.CONFIRM_PASSWORD` (153) |
| Confirm password required error | `Confirmar Contraseña es requerido` | `GENERAL.VALIDATION.REQUIRED` (232) interpolated |
| Password mismatch error | `Las contraseñas no son iguales` | `GENERAL.VALIDATION.INVALID_PASSWORD` (241) |
| Cell phone label | `Teléfono` | `GENERAL.CELL_PHONE` (189) |
| Cell phone required error | `Teléfono es requerido` | `GENERAL.VALIDATION.REQUIRED` (232) interpolated |
| Email label (not required, no validation) | `Correo` | `GENERAL.EMAIL` (161) |
| Store name label | `Nombre de la tienda` | `STORE.STORE_NAME` (347) |
| Store name required error | `Nombre de la tienda es requerido` | `GENERAL.VALIDATION.REQUIRED` (232) interpolated |
| Submit button (idle) | `Registrar` | `REGISTRATION.SIGNUP_BUTTON` (134) |
| Submit button (loading) | `Registrando...` | NEW — no Angular analog visible in this component; reuses existing React catalog value `AUTH.REGISTERING` |
| Offline banner | `Estás offline. Se requiere conexión para registrarte.` | NEW — Angular `register.component.ts` has no connectivity check/banner; wording follows the `AUTH.OFFLINE_LOGIN` pattern |
| Success redirect text | `Cuenta creada. Redirigiendo al inicio de sesión…` | NEW — Angular has no visible post-submit success copy in this component; kept functionally equivalent, translated |
| Catch-block fallback: unexpected error | `Ocurrió un error inesperado. Intente nuevamente.` | `REGISTRATION.UNEXPECTED_ERROR` (es.ts:138-139, verbatim; was referenced but commented out in Angular's `register.component.ts`) |
| Catch-block fallback: email already taken | NEW, spec-fixed Spanish string | `REGISTRATION.EMAIL_TAKEN` — no Angular correlate (`register.component.ts` has no client-side email-uniqueness branching) |
| Catch-block fallback: generic validation error | NEW, spec-fixed Spanish string | `REGISTRATION.VALIDATION_ERROR` — no Angular correlate |

#### Scenario: Register form renders all labels in Spanish
- GIVEN a guest user opens `/register`
- WHEN the page renders
- THEN every field label, validation message, and button text above renders byte-identical to its Required text

#### Scenario: Offline submit shows the Spanish offline banner
- GIVEN the browser reports offline (`ConnectivityService.isOnline()` is false)
- WHEN the user submits the register form
- THEN the banner text equals `Estás offline. Se requiere conexión para registrarte.`

#### Scenario: Register catch-block shows Spanish fallback copy
- GIVEN the register submit request fails (network/server error, email-taken, or generic validation)
- WHEN the corresponding catch branch renders its fallback message
- THEN the text equals the matching `REGISTRATION.UNEXPECTED_ERROR` / `REGISTRATION.EMAIL_TAKEN` / `REGISTRATION.VALIDATION_ERROR` Spanish value exactly

### Requirement: Login field label forced literal parity

`app/auth/routes/login.tsx` MUST render the label of the identifier input as
`Usuario` (Angular `GENERAL.LOGIN`, es.ts:151), byte-identical, even though the
underlying `<input>` keeps `type="email"` / `autoComplete="email"` unchanged.

#### Scenario: Login label shows "Usuario" not "Email"
- GIVEN a guest user opens `/login`
- WHEN the page renders
- THEN the label above the identifier input reads exactly `Usuario`
- AND the input's `type` and `autoComplete` attributes are unchanged from current behavior

### Requirement: Unsaved-changes dialog text parity

`app/shared/components/unsaved-changes-dialog.tsx` MUST render the same copy as
Angular's SweetAlert in `can-deactivate.guard.ts` (es.ts line refs below).

| Element | Required text | Angular key (es.ts line) |
|---|---|---|
| Title | `Confirmación` | `GENERAL.CONFIRM_TITLE` (175) |
| Message | `Usted tiene cambios pendientes. ¿Desea salvar los cambios antes de pasar a la otra página?` | `GENERAL.WIZARD_DIRTY_MESSAGE` (190) |
| Save button (maps to `isConfirmed`/Yes) | `Si` | `GENERAL.YES` (156) |
| Discard button (maps to `isDenied`/No) | `No` | `GENERAL.NO` (155) |
| Cancel button | `Cancelar` | `GENERAL.CANCEL` (157) |

#### Scenario: Dialog renders Spanish confirmation copy
- GIVEN a form with unsaved changes triggers the dialog
- WHEN the dialog opens
- THEN title, message, and the 3 button labels equal the Required text above exactly

### Requirement: Native unsaved-changes confirm() text parity

`app/shared/lib/hooks/use-unsaved-changes-prompt.ts` MUST pass the same Spanish
message used in the dialog (Requirement above) to `window.confirm()`, i.e. exactly
`Usted tiene cambios pendientes. ¿Desea salvar los cambios antes de pasar a la otra página?`
(native `confirm()` only supports one string with OK/Cancel — this is a scoped
simplification of the 3-option SweetAlert, not a behavior change).

#### Scenario: Native confirm shows Spanish text on navigation block
- GIVEN `isDirty` is true and the user navigates to a different route
- WHEN `useBlocker` enters `blocked` state
- THEN `window.confirm()` is called with the exact message above

### Requirement: Root ErrorBoundary Spanish copy

`app/root.tsx` `ErrorBoundary` MUST render Spanish text via the Angular analog keys.
The default (non-route-error) fallback copy is also translated, since the ErrorBoundary
can render on paths that never mount `I18nProvider` — it reads `messages['KEY']` directly.

| Case | Required text | Angular key (es.ts line) |
|---|---|---|
| Non-404 route error heading | `Error` | `GENERAL.ERROR` (181) |
| 404 route error heading | `404` | (numeric status, unchanged) |
| 404 details | `Puede que necesite estar conectado a Internet para hacer esta operación. Por favor, vuelva a intentarlo y si persiste el error contacte al equipo de soporte técnico.` | `GENERAL.RESPONSE.ERROR404_MESSAGE` (254-255) |
| Non-404 / generic details (also generic component-error fallback) | `Por favor, vuelva a intentarlo y si persiste el error contacte al equipo de soporte técnico.` | `GENERAL.RESPONSE.ERROR500_MESSAGE` (256) |

DEV-only stack trace / `error.message` display is unchanged (technical, not user copy).

#### Scenario: 404 route shows Spanish page-not-found copy
- GIVEN a route throws a 404 `Response`
- WHEN `ErrorBoundary` renders
- THEN heading is `404` and details equal `GENERAL.RESPONSE.ERROR404_MESSAGE` text exactly

#### Scenario: Non-404 error shows Spanish generic copy
- GIVEN a route throws a non-404 error
- WHEN `ErrorBoundary` renders
- THEN heading equals `Error` and details equal `GENERAL.RESPONSE.ERROR500_MESSAGE` text exactly

### Requirement: Navbar and sidebar aria-labels in Spanish

`app/shared/components/navbar.tsx` and `sidebar.tsx` MUST use the following Spanish
aria-labels. Angular has NO equivalent strings for these (React-only accessibility
attributes) — these are NEW, spec-fixed strings, not sourced from `es.ts`.

| Element | Previous (English) | Required (Spanish) |
|---|---|---|
| Sidebar toggle button (navbar.tsx:38) | `Toggle sidebar` | `Alternar barra lateral` |
| User menu button (navbar.tsx:68) | `User menu` | `Menú de usuario` |
| Sidebar nav landmark (sidebar.tsx:37) | `Main navigation` | `Navegación principal` |
| Sidebar collapse button (sidebar.tsx:46) | `Collapse sidebar` | `Contraer barra lateral` |

(`navbar.tsx` `MENU.TUTORIAL` aria-label was already Spanish via an existing key — not a gap, excluded from this list.)

#### Scenario: All 4 aria-labels are Spanish
- GIVEN the app shell renders (navbar + sidebar)
- WHEN inspecting the 4 elements above
- THEN each `aria-label` equals its Required (Spanish) value exactly

### Requirement: Register terms-acceptance toggle

`app/auth/routes/register.tsx` MUST render a terms-acceptance toggle that gates
submission, mirroring Angular's `accept` control (`register.component.html:191-210`,
`Validators.required`). Added as a follow-on to the text-parity pass (commit `d6217e3`),
verified against Angular source (engram `sdd/view-text-parity/terms-toggle-verify`).

- Toggle is a boolean `accepted`, initially false.
- Label = `REGISTRATION.ACCEPT_CONDITIONS` immediately followed by a link with text
  `REGISTRATION.TERMS_CONDITIONS`.
- Link targets React route `/terms-conditions` (React's real terms route, per
  `footer.tsx`), opens `target="_blank"` `rel="noreferrer"`. Angular's
  `/terminos-condiciones` slug is intentionally NOT copied (no such React route).
- Info line = `REGISTRATION.INFO_TERMS_CONDITIONS`.
- Submit button disabled when `!accepted`, preserving React's pre-existing `isLoading`
  gate: `disabled={isLoading || !accepted}`. Mirrors Angular `[disabled]="!accept.value"`.

| Key | Required text (verbatim, Angular vocabs/es.ts) |
|---|---|
| `REGISTRATION.ACCEPT_CONDITIONS` | `Estoy de acuerdo con los ` (135 — trailing space) |
| `REGISTRATION.TERMS_CONDITIONS` | `términos y condiciones` (136) |
| `REGISTRATION.INFO_TERMS_CONDITIONS` | `Usted debe aceptar los términos y condiciones para registrarse en el sistema.` (137) |

#### Scenario: Submit gated by acceptance
- GIVEN the register form renders
- WHEN the accept toggle is off
- THEN the submit button is disabled
- AND WHEN the toggle is turned on (not loading)
- THEN the submit button is enabled

## Out of Scope

- Any color, font, layout, or structural change beyond the authorized terms toggle above.
- `login.tsx` input `type`/`autoComplete` (stays `email`).
- Dynamic/backend-sourced error banner text (API response messages) — only static
  fallback/UI copy is specified here.
