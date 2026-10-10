/**
 * Catálogo de plantillas del catálogo público: SOLO los ids y su etiqueta i18n.
 *
 * Este archivo no importa ningún componente de plantilla a propósito. El panel del dueño
 * (`sales/routes/web-catalog.tsx`) necesita la lista para el selector, y si importara el registro
 * completo arrastraría las vistas del catálogo público —y sus dependencias— al bundle de una ruta
 * autenticada. `registry.ts` es quien ata cada id a su componente.
 */
export const CATALOG_TEMPLATES = [
  { id: 'default', labelId: 'WEB_CATALOG.TEMPLATE_DEFAULT' },
  { id: 'boutique', labelId: 'WEB_CATALOG.TEMPLATE_BOUTIQUE' },
] as const;

/** Plantilla que usa una tienda sin `templateId`: la vista actual. */
export const DEFAULT_TEMPLATE_ID = 'default';
