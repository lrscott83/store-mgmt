export interface InlineScript {
  attrs: string;
  content: string;
}
export declare const STABLE_INLINE_PREFIX: RegExp;
export declare function scanInlineScripts(html: string): InlineScript[];
export interface ExternalizeOptions {
  prefix?: RegExp;
}
export interface ExternalizeResult {
  html: string;
  /** `fileName` is workspace-relative (`assets/...`); the emitted `src` is root-relative (`/assets/...`). */
  assets: Array<{ fileName: string; content: string }>;
}
export declare function externalizeInlineScripts(html: string, options?: ExternalizeOptions): ExternalizeResult;
