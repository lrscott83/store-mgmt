// route-guard-parity: re-exports AppLayout's chrome (sidebar/navbar/breadcrumbs/
// footer) WITHOUT its `clientLoader` (== authLoader). Angular nests help/tutorial
// inside ClientLayoutComponent with NO canActivate guard (app-routing.module.ts:
// 89-97) — chrome + public access. This module gives routes.ts a distinct
// layout file/id that mounts the same chrome but is never auth-gated.
export { default } from './app-layout';
