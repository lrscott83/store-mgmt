namespace Application.Abstractions.Authentication;

public sealed record WrappedDekResult(string WrappedDek, string WrapSalt, string WrapIv, int Iterations);

public interface IStoreKeyWrapService
{
    WrappedDekResult WrapDek(string storedPasswordHash, byte[] dek);
}
