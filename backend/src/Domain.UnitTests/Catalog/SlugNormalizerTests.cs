using System.Text.RegularExpressions;
using Domain.Common.Catalog;
using FluentAssertions;

namespace Domain.UnitTests.Catalog
{
    /// <summary>
    /// Slugs públicos del catálogo (decisión D4, plan 2026-09-27): minúsculas, sin tildes ni ñ,
    /// separadores en guiones y sufijo -2, -3, ... ante colisión.
    /// </summary>
    public class SlugNormalizerTests
    {
        private static readonly Regex AllowedSlug = new("^[a-z0-9][a-z0-9-]*$", RegexOptions.Compiled);

        [Theory]
        [InlineData("Abarrotes Ñandú", "abarrotes-nandu")]
        [InlineData("Café & Té", "cafe-te")]
        [InlineData("Ropa   de   niño", "ropa-de-nino")]
        [InlineData("  Zapatos  ", "zapatos")]
        [InlineData("Bebés (0-2 años)", "bebes-0-2-anos")]
        [InlineData("María José", "maria-jose")]
        public void Normalize_ShouldLowercaseAndStripAccents(string input, string expected)
        {
            SlugNormalizer.Normalize(input).Should().Be(expected);
        }

        [Fact]
        public void Normalize_ShouldCollapseRepeatedSeparators()
        {
            SlugNormalizer.Normalize("A -- B /// C").Should().Be("a-b-c");
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData("???")]
        [InlineData("---")]
        public void Normalize_ShouldFallBack_WhenNothingUsableIsLeft(string? input)
        {
            SlugNormalizer.Normalize(input).Should().Be(SlugNormalizer.FallbackSlug);
        }

        [Fact]
        public void Normalize_ShouldTruncateLongNames_WithoutTrailingSeparator()
        {
            string input = string.Join("-", Enumerable.Repeat("categoria", 20));

            string slug = SlugNormalizer.Normalize(input);

            slug.Length.Should().BeLessThanOrEqualTo(SlugNormalizer.MaxLength);
            AllowedSlug.IsMatch(slug).Should().BeTrue();
            slug.Should().NotEndWith("-");
        }

        [Fact]
        public void Normalize_ShouldAlwaysProduceAllowedAlphabet()
        {
            SlugNormalizer.Normalize("Ñoño ÑÁÉÍÓÚ üäö (2026) 100%").Should().MatchRegex(AllowedSlug);
        }

        [Fact]
        public void MakeUnique_ShouldReturnTheBaseSlug_WhenItIsFree()
        {
            SlugNormalizer.MakeUnique("ropa-de-nino", _ => false).Should().Be("ropa-de-nino");
        }

        [Fact]
        public void MakeUnique_ShouldAppendNumericSuffix_OnCollision()
        {
            var taken = new HashSet<string> { "ropa", "ropa-2" };

            SlugNormalizer.MakeUnique("ropa", taken.Contains).Should().Be("ropa-3");
        }

        [Fact]
        public void MakeUnique_ShouldNormalizeBeforeChecking()
        {
            var taken = new HashSet<string> { "cafe-te" };

            SlugNormalizer.MakeUnique("Café & Té", taken.Contains).Should().Be("cafe-te-2");
        }

        [Fact]
        public void MakeUnique_ShouldKeepCandidatesWithinMaxLength()
        {
            string longRoot = SlugNormalizer.Normalize(string.Join("-", Enumerable.Repeat("producto", 20)));

            // El sufijo se recorta para que el candidato nunca pase del máximo.
            string candidate = SlugNormalizer.MakeUnique(longRoot, taken => taken == longRoot);

            candidate.Length.Should().BeLessThanOrEqualTo(SlugNormalizer.MaxLength);
            AllowedSlug.IsMatch(candidate).Should().BeTrue();
            candidate.Should().NotBe(longRoot);
            candidate.Should().EndWith("-2");
        }
    }
}
