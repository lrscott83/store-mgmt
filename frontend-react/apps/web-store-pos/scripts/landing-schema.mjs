// Single source of truth for the schema.org identifiers of the landing's JSON-LD.
//
// The build script (`generate-landing-page.mjs`) WRITES the graph; the runtime helper
// (`app/home/lib/landing-json-ld.ts`) later finds the application node to complete `offers`.
// Keeping the type names here means a rename cannot silently split those two halves into
// "no offers published, page still renders".
export const SCHEMA_ORG_CONTEXT = 'https://schema.org';
export const SCHEMA_TYPE_ORGANIZATION = 'Organization';
export const SCHEMA_TYPE_SOFTWARE_APPLICATION = 'SoftwareApplication';
export const SCHEMA_TYPE_OFFER = 'Offer';
