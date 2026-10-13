/** Máximo del slug público del catálogo (espejo de `SlugNormalizer.MaxLength`). */
export const MAX_CATALOG_SLUG_LENGTH = 63;

/**
 * Normaliza un texto libre al alfabeto del slug público del catálogo: minúsculas, sin diacríticos
 * (ñ → n), separadores colapsados en un guion y recortado al máximo. Espejo EN CLIENTE de
 * `Domain/Common/Catalog/SlugNormalizer` — el backend vuelve a normalizar, así que esto NO es una
 * validación: sirve para que el SuperAdmin VEA el resultado antes de guardar.
 *
 * Diferencia deliberada con el backend: sin ningún carácter válido devuelve `''` (no `'catalogo'`).
 * El `FallbackSlug` del backend pertenece al AUTOGENERADO; aquí un campo vacío es un campo vacío y
 * la UI bloquea el guardado, en vez de inventar un slug que nadie eligió.
 */
export function normalizeCatalogSlug(value: string): string {
  const decomposed = value.trim().toLowerCase().normalize('NFD');

  let slug = '';
  let lastWasSeparator = false;
  for (const character of decomposed) {
    // Los marks (tildes, diéresis, la tilde de la ñ) se descartan.
    if (/^\p{Mn}$/u.test(character)) continue;

    if ((character >= 'a' && character <= 'z') || (character >= '0' && character <= '9')) {
      slug += character;
      lastWasSeparator = false;
    } else if (!lastWasSeparator && slug.length > 0) {
      slug += '-';
      lastWasSeparator = true;
    }
  }

  slug = trimSeparators(slug);
  if (slug.length > MAX_CATALOG_SLUG_LENGTH) {
    slug = trimSeparators(slug.slice(0, MAX_CATALOG_SLUG_LENGTH));
  }
  return slug;
}

function trimSeparators(value: string): string {
  let start = 0;
  let end = value.length - 1;
  while (start <= end && value[start] === '-') start++;
  while (end >= start && value[end] === '-') end--;
  return start > end ? '' : value.slice(start, end + 1);
}
