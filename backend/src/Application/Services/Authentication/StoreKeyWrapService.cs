using Application.Abstractions.Authentication;
using System.Security.Cryptography;
using System.Text;

namespace Application.Services.Authentication;

public sealed class StoreKeyWrapService : IStoreKeyWrapService
{
    private const int KekIterations = 210_000;
    private const int SaltBytes = 16;
    private const int IvBytes = 12;
    private const int KeyBytes = 32;
    private const int TagBytes = 16;

    public WrappedDekResult WrapDek(string storedPasswordHash, byte[] dek)
    {
        byte[] wrapSalt = RandomNumberGenerator.GetBytes(SaltBytes);
        byte[] wrapIv = RandomNumberGenerator.GetBytes(IvBytes);

        byte[] kek = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(storedPasswordHash),
            wrapSalt,
            KekIterations,
            HashAlgorithmName.SHA256,
            KeyBytes);

        byte[] ciphertext = new byte[dek.Length];
        byte[] tag = new byte[TagBytes];

        using var aesGcm = new AesGcm(kek, TagBytes);
        aesGcm.Encrypt(wrapIv, dek, ciphertext, tag);

        byte[] wrapped = new byte[ciphertext.Length + tag.Length];
        Buffer.BlockCopy(ciphertext, 0, wrapped, 0, ciphertext.Length);
        Buffer.BlockCopy(tag, 0, wrapped, ciphertext.Length, tag.Length);

        return new WrappedDekResult(
            Convert.ToBase64String(wrapped),
            Convert.ToBase64String(wrapSalt),
            Convert.ToBase64String(wrapIv),
            Iterations: KekIterations);
    }
}
