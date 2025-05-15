namespace Application.Dtos.Authentication
{
    public sealed record StoreModuleFeaturesDto(Guid StoreId, string StoreName, int ModuleId, ICollection<int> FeatureIds)
    {
    }
}
