using Application.Abstractions.Authentication;
using System.Security.Cryptography;
using System.Text;

namespace SMCA.WebApi.Services
{
    public sealed class HashPasswordService : IHashPasswordService
    {
        private readonly string _pepper = "B1BBA4F5-AB26-4175-96D5-22642F50A2BB";
        private readonly int _iteration = 3;

        public string HashPassword(string password)
        {
            return ComputeHash(password, salt: "", _pepper, _iteration);
        }

        public bool VerifyPassword(string password, string storedHash)
        {
            // 1. Try new format (pepper + iteration) first
            string newFormatHash = ComputeHash(password, "", _pepper, _iteration);
            if (newFormatHash == storedHash)
                return true;

            // 2. Fall back to legacy format (raw SHA256) for backward compat
            string legacyHash = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(password)));
            if (legacyHash == storedHash)
                return true;

            return false;
        }

        public static string ComputeHash(string password, string salt, string pepper, int iteration)
        {
            if (iteration <= 0) return password;

            using var sha256 = SHA256.Create();
            var passwordSaltPepper = $"{password}{salt}{pepper}";
            var byteValue = Encoding.UTF8.GetBytes(passwordSaltPepper);
            var byteHash = sha256.ComputeHash(byteValue);
            var hash = Convert.ToBase64String(byteHash);
            return ComputeHash(hash, salt, pepper, iteration - 1);
        }

        public static string GenerateSalt()
        {
            using var rng = RandomNumberGenerator.Create();
            var byteSalt = new byte[16];
            rng.GetBytes(byteSalt);
            var salt = Convert.ToBase64String(byteSalt);
            return salt;
        }
    }
}
