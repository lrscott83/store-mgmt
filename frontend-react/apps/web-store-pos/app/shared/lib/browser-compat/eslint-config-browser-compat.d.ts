/**
 * Type surface for the browser-compat policy package.
 *
 * `@store-mgmt/eslint-config` ships plain ESM without a declaration file, and
 * this workspace does not enable `allowJs`, so TypeScript cannot infer the
 * policy exports. Declaring the module ambiently here keeps the test free of
 * `@ts-expect-error` while staying inside the app workspace.
 */
declare module '@store-mgmt/eslint-config/browser-compat' {
  export interface PolyfilledApi {
    readonly api: string;
    readonly chromeVersion: number;
  }

  export interface BannedApi {
    readonly api: string;
    readonly chromeVersion: number;
    readonly alternative: string;
    readonly selector: string;
  }

  export const BROWSER_FLOOR: { readonly chrome: number };
  export const POLYFILLED_APIS: readonly PolyfilledApi[];
  export const BANNED_APIS: readonly BannedApi[];
}
