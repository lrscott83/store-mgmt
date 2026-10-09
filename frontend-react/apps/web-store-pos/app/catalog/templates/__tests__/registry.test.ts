import { describe, expect, it } from 'vitest';
import { BoutiqueCatalogTemplate } from '~/catalog/templates/boutique-catalog';
import { DefaultCatalogTemplate } from '~/catalog/templates/default-catalog';
import { resolveTemplate } from '~/catalog/templates/registry';
import { CATALOG_TEMPLATES, DEFAULT_TEMPLATE_ID } from '~/catalog/templates/template-ids';

/**
 * El registro es lo que convierte el `templateId` que llega en el config público en la VISTA que
 * se pinta. Su contrato es corto y el fallback importa: un id que este build no conoce no puede
 * romper la página.
 */
describe('resolveTemplate', () => {
  it('resuelve la plantilla por defecto', () => {
    expect(resolveTemplate(DEFAULT_TEMPLATE_ID)).toBe(DefaultCatalogTemplate);
  });

  it('resuelve la plantilla boutique', () => {
    expect(resolveTemplate('boutique')).toBe(BoutiqueCatalogTemplate);
  });

  it('cae a la plantilla por defecto con un id desconocido', () => {
    expect(resolveTemplate('plantilla-que-no-existe')).toBe(DefaultCatalogTemplate);
  });

  /**
   * Regresión R3-TEMPLATE-PROTO: un object literal hereda las claves de `Object.prototype`, así
   * que sin la guarda `Object.hasOwn` un id como `constructor` o `__proto__` se colaba como
   * "plantilla" (truthy) y `<Template />` recibía algo que no es un componente.
   */
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])(
    'cae a la plantilla por defecto con una clave heredada de Object.prototype (%s)',
    (id) => {
      expect(resolveTemplate(id)).toBe(DefaultCatalogTemplate);
    },
  );

  it.each([null, undefined, ''])('cae a la plantilla por defecto con id ausente (%s)', (id) => {
    expect(resolveTemplate(id)).toBe(DefaultCatalogTemplate);
  });
});

describe('CATALOG_TEMPLATES', () => {
  it('anuncia la plantilla por defecto primero', () => {
    expect(CATALOG_TEMPLATES[0].id).toBe(DEFAULT_TEMPLATE_ID);
  });

  it('cada id anunciado resuelve a un componente', () => {
    for (const template of CATALOG_TEMPLATES) {
      expect(resolveTemplate(template.id)).toBeDefined();
    }
  });
});
