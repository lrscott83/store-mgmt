using Application.Abstractions.Authentication;
using System.Security.Cryptography;
using System.Text;

namespace Application.Services.Authentication;

public sealed class OfflinePreHashProtector : IOfflinePreHashProtector
{
    private const byte EnvelopeVersion = 0x01;
    private const int NonceBytes = 12;
    private const int TagBytes = 16;

    private readonly byte[] _key;

    public OfflinePreHashProtector(string masterSecret)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(masterSecret);
        byte[] info = Encoding.UTF8.GetBytes("offline-password-prehash-v1");
        _key = HKDF.DeriveKey(HashAlgorithmName.SHA256, Encoding.UTF8.GetBytes(masterSecret), outputLength: 32, salt: null, info);
    }

    public string Protect(string password, Guid userId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(password);

        string preHash = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(password)));
        byte[] plaintext = Encoding.UTF8.GetBytes(preHash);
        byte[] aad = Encoding.UTF8.GetBytes(userId.ToString("D"));

        byte[] nonce = RandomNumberGenerator.GetBytes(NonceBytes);
        byte[] ciphertext = new byte[plaintext.Length];
        byte[] tag = new byte[TagBytes];

        using (var aesGcm = new AesGcm(_key, TagBytes))
        {
            aesGcm.Encrypt(nonce, plaintext, ciphertext, tag, aad);
        }

        byte[] envelope = new byte[1 + nonce.Length + ciphertext.Length + tag.Length];
        envelope[0] = EnvelopeVersion;
        Buffer.BlockCopy(nonce, 0, envelope, 1, nonce.Length);
        Buffer.BlockCopy(ciphertext, 0, envelope, 1 + nonce.Length, ciphertext.Length);
        Buffer.BlockCopy(tag, 0, envelope, 1 + nonce.Length + ciphertext.Length, tag.Length);

        return Convert.ToBase64String(envelope);
    }

    public string? Unprotect(string? envelope, Guid userId)
    {
        if (envelope is null)
            return null;

        byte[] raw = Convert.FromBase64String(envelope);
        // version byte (raw[0]) reserved for future rotation; only 0x01 exists today.
        byte[] nonce = raw[1..(1 + NonceBytes)];
        byte[] tag = raw[^TagBytes..];
        byte[] ciphertext = raw[(1 + NonceBytes)..^TagBytes];
        byte[] aad = Encoding.UTF8.GetBytes(userId.ToString("D"));

        byte[] plaintext = new byte[ciphertext.Length];
        using (var aesGcm = new AesGcm(_key, TagBytes))
        {
            aesGcm.Decrypt(nonce, ciphertext, tag, plaintext, aad);
        }

        return Encoding.UTF8.GetString(plaintext);
    }
}
