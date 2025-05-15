using System.Text.RegularExpressions;

namespace Domain.Common.Extensions
{
    public static class VerifyExtension
    {
        /// <summary>
        /// Generate a random code.
        /// </summary>
        /// <param name="length">Length of the code to generate. Greater than 0 and less than 9</param>
        /// <returns></returns>
        public static string GenerateCode(byte length)
        {
            if (length < 1 || length > 8)
                throw new InvalidOperationException("The code length must be greater than 0 and less than 9");
            var random = new Random();
            int code = random.Next(
                (int)Math.Pow(10,length - 1), 
                (int)Math.Pow(10, length));
            return $"{code}";
        }

        public static bool IsNumeric(string value)
        {
            return Regex.IsMatch(value, RegexExtensions.IsNumeric);
        }
    }
}
