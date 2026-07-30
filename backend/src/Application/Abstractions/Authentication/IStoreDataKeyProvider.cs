namespace Application.Abstractions.Authentication;

public interface IStoreDataKeyProvider
{
    byte[] GetDek(Guid storeId);
}
