using Application.Abstractions.Authentication;
using System.Security.Cryptography;
using System.Text;

namespace Application.Services.Authentication
{
    public sealed class OfflineVerifierService : IOfflineVerifierService
    {
        private const int Iterations = 210_000;
        private const int SaltBytes = 16;
        private const int KeyBytes = 32;

        public OfflineVerifierResult CreateVerifier(string storedPasswordHash)
        {
            byte[] salt = RandomNumberGenerator.GetBytes(SaltBytes);
            byte[] hash = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(storedPasswordHash),
                salt,
                Iterations,
                HashAlgorithmName.SHA256,
                KeyBytes);

            return new OfflineVerifierResult(
                Convert.ToBase64String(hash),
                Convert.ToBase64String(salt),
                Iterations);
        }
    }
}
