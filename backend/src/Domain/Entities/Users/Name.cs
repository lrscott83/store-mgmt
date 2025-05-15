using System.Diagnostics.CodeAnalysis;
using System.Runtime.CompilerServices;

namespace Domain.Entities.Users
{
    public sealed record Name
    {
        public Name(string? value)
        {
            Ensure.NotNullOrEmpty(value);
            Value = value;
        }

        public string Value { get; }
    }

    public static class Ensure
    {
        public static void NotNullOrEmpty(
            [NotNull] string? value,
            [CallerArgumentExpression("value")] string? paramName = null)
        {
            if (string.IsNullOrEmpty(value))
                throw new ArgumentNullException(paramName);
        }
    }
}
