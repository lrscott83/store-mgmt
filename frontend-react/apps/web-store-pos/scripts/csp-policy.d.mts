export type CspEnvironment = 'dev' | 'prod';
export interface CspDevOptions {
  apiUrl?: string;
  devServerOrigin?: string;
  hydrationScriptHashes?: string[];
}
export declare function buildCspHeaderValue(env: CspEnvironment, options?: CspDevOptions): string;
export declare function buildCspDirectives(env: CspEnvironment, options?: CspDevOptions): Map<string, string[]>;
export declare function deriveApiOrigin(apiUrl: string | undefined): string | null;
export declare const ALLOWED_ENV_DELTA_DIRECTIVES: readonly string[];
export declare const CSP_HEADER_NAME: string;
