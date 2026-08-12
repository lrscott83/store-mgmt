export interface KnownDevOnlyViolation {
  effectiveDirective: string;
  blockedURI: string;
  sampleMatch: RegExp;
  reason: string;
}

export interface CspViolationSample {
  effectiveDirective: string;
  blockedURI: string;
  sample: string;
}

export declare const KNOWN_DEV_ONLY_VIOLATIONS: readonly KnownDevOnlyViolation[];
export declare function isKnownDevOnly(record: CspViolationSample): boolean;
