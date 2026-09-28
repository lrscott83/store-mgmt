using System.Globalization;
using System.Text;

namespace Domain.Common.Catalog
{
    /// <summary>
    /// Normalización de los slugs públicos del catálogo (decisión D4 del plan 2026-09-27):
    /// minúsculas, sin tildes ni diacríticos (ñ -> n), separadores colapsados en un guion,
    /// recortado a <see cref="MaxLength"/> y con sufijo automático (-2, -3, ...) ante colisión.
    /// Alfabeto resultante: ^[a-z0-9][a-z0-9-]*$.
    /// </summary>
    public static class SlugNormalizer
    {
        public const int MaxLength = 63;

        /// <summary>Se usa cuando el nombre no deja ningún carácter válido (p.ej. "???").</summary>
        public const string FallbackSlug = "catalogo";

        /// <summary>Normaliza un nombre libre a slug. Nunca devuelve null ni vacío.</summary>
        public static string Normalize(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
                return FallbackSlug;

            string decomposed = value.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);

            var builder = new StringBuilder(decomposed.Length);
            bool lastWasSeparator = false;
            foreach (char character in decomposed)
            {
                // Los marks (tildes, diéresis, la tilde de la ñ) se descartan.
                if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
                    continue;

                if ((character >= 'a' && character <= 'z') || (character >= '0' && character <= '9'))
                {
                    builder.Append(character);
                    lastWasSeparator = false;
                }
                else if (!lastWasSeparator && builder.Length > 0)
                {
                    builder.Append('-');
                    lastWasSeparator = true;
                }
            }

            string slug = TrimSeparators(builder.ToString());
            if (slug.Length > MaxLength)
                slug = TrimSeparators(slug[..MaxLength]);

            return slug.Length == 0 ? FallbackSlug : slug;
        }

        /// <summary>
        /// Devuelve el primer slug libre empezando por <paramref name="baseSlug"/> y siguiendo con
        /// "-2", "-3", ... <paramref name="exists"/> responde si el candidato ya está tomado.
        /// </summary>
        public static string MakeUnique(string baseSlug, Func<string, bool> exists)
        {
            string root = Normalize(baseSlug);
            if (!exists(root))
                return root;

            for (int suffix = 2; suffix < int.MaxValue; suffix++)
            {
                string suffixText = "-" + suffix.ToString(CultureInfo.InvariantCulture);
                string trimmedRoot = root;
                if (trimmedRoot.Length + suffixText.Length > MaxLength)
                    trimmedRoot = TrimSeparators(trimmedRoot[..(MaxLength - suffixText.Length)]);

                string candidate = trimmedRoot + suffixText;
                if (!exists(candidate))
                    return candidate;
            }

            throw new InvalidOperationException($"No se pudo generar un slug único a partir de '{baseSlug}'.");
        }

        private static string TrimSeparators(string value)
        {
            int start = 0;
            int end = value.Length - 1;
            while (start <= end && value[start] == '-') start++;
            while (end >= start && value[end] == '-') end--;
            return start > end ? string.Empty : value.Substring(start, end - start + 1);
        }
    }
}
