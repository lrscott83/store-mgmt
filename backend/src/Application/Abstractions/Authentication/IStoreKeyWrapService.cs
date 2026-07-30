namespace Application.Abstractions.Authentication;

public sealed record WrappedDekResult(string WrappedDek, string WrapSalt, string WrapIv);

public interface IStoreKeyWrapService
{
    WrappedDekResult WrapDek(string storedPasswordHash, byte[] dek);
}
