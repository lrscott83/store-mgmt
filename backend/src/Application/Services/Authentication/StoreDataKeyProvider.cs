using Application.Abstractions.Authentication;
using System.Security.Cryptography;
using System.Text;

namespace Application.Services.Authentication;

public sealed class StoreDataKeyProvider : IStoreDataKeyProvider
{
    private readonly byte[] _masterSecretBytes;

    public StoreDataKeyProvider(string masterSecret)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(masterSecret);
        _masterSecretBytes = Encoding.UTF8.GetBytes(masterSecret);
    }

    public byte[] GetDek(Guid storeId)
    {
        byte[] info = Encoding.UTF8.GetBytes(storeId.ToString("D"));
        return HKDF.DeriveKey(HashAlgorithmName.SHA256, _masterSecretBytes, outputLength: 32, salt: null, info);
    }
}
