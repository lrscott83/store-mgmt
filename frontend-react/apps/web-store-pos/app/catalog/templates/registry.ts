import type { ComponentType } from 'react';
import type { CatalogTemplateProps } from '~/catalog/templates/catalog-template';
import { BoutiqueCatalogTemplate } from '~/catalog/templates/boutique-catalog';
import { DefaultCatalogTemplate } from '~/catalog/templates/default-catalog';
import { DEFAULT_TEMPLATE_ID } from '~/catalog/templates/template-ids';

/**
 * Catálogo de plantillas (vistas) del catálogo público, por `templateId`.
 *
 * Añadir una plantilla es registrarla aquí y declararla en `template-ids.ts`: el contenedor
 * resuelve el id que viene del config público y pinta el componente. Ninguna plantilla es la dueña
 * de la funcionalidad —todas reciben el mismo `CatalogTemplateProps`—, así que una vista nueva no
 * puede divergir en comportamiento.
 */
const TEMPLATES: Record<string, ComponentType<CatalogTemplateProps>> = {
  default: DefaultCatalogTemplate,
  boutique: BoutiqueCatalogTemplate,
};

/**
 * Resuelve un `templateId` a su componente. Un id ausente, desconocido o en blanco cae a la
 * plantilla por defecto: una tienda con un id que este build no conoce se ve como hoy, nunca rota.
 */
export function resolveTemplate(
  templateId: string | null | undefined,
): ComponentType<CatalogTemplateProps> {
  // `Object.hasOwn` y no `TEMPLATES[templateId]`: un object literal hereda las claves de
  // `Object.prototype`, así que ids como `constructor` o `__proto__` serían truthy y se
  // devolverían como si fueran una plantilla — y `<Template />` recibiría algo que no es un
  // componente. Con `hasOwn` solo cuentan las claves propias.
  if (templateId && Object.hasOwn(TEMPLATES, templateId)) {
    return TEMPLATES[templateId];
  }
  return TEMPLATES[DEFAULT_TEMPLATE_ID];
}
