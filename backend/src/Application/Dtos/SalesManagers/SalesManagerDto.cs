namespace Application.Dtos.SalesManagers
{
    /// <summary>Vista del Owner sobre uno de sus gestores de ventas.</summary>
    public sealed record SalesManagerDto(
        Guid Id,
        Guid UserId,
        string Login,
        string FullName,
        string? CellPhone,
        string? Email,
        bool IsActive);
}
