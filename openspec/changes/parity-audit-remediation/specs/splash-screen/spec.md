# Splash Screen Specification (New Capability)

## Purpose

Add a React boot splash-screen fade-out, mirroring Angular's `SplashScreenService`
(`presentation/splash-screen/splash-screen.service.ts`): a static splash element is shown on initial
load and is faded out (not abruptly removed) once the app is ready to render.

## Requirements

### Requirement: Splash Element Fades Out On Boot
On successful app initialization, the splash element MUST be hidden via an opacity transition from
`1` to `0` over approximately 800ms (mirrors Angular's `animate(800, style({ opacity: '0' }))`),
followed by removing the element from the DOM (or setting `display: none` if removal is
unavailable), rather than an instant hide/removal.

#### Scenario: Splash fades before disappearing
- GIVEN the splash element is visible at app boot
- WHEN the app signals it is ready
- THEN the splash element's opacity animates from `1` to `0` over ~800ms before being removed/hidden

#### Scenario: Fade only runs once
- GIVEN the splash fade has already completed
- WHEN the ready signal fires again (e.g. a duplicate call)
- THEN the fade-out MUST NOT run a second time (mirrors Angular's `stopped` guard)

### Requirement: Hide Is A No-Op Before The Splash Element Exists
Calling the hide operation before the splash element reference has been established MUST be a
safe no-op (mirrors Angular's `if (!this.el) return;`), not a thrown error.

#### Scenario: Hide before init is safe
- GIVEN the splash element reference has not yet been set
- WHEN the hide operation is invoked
- THEN it returns without error and without throwing
