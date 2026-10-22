using Domain.Common.Enums;

namespace Application.Dtos.SalesManagers
{
    /// <summary>
    /// Vista del GESTOR sobre un pedido suyo. No incluye datos de otros gestores ni del Owner.
    /// </summary>
    public sealed record SalesManagerOrderDto(
        Guid OrderId,
        string? Code,
        Guid StoreId,
        string StoreName,
        OrderStatus Status,
        DateTime Date,
        decimal Total,
        Currency Currency,
        int ItemsCount);

    /// <summary>
    /// Comisión congelada de UNA línea de pedido, como la ve el gestor que la ganó.
    /// </summary>
    public sealed record SalesManagerCommissionDto(
        Guid Id,
        Guid OrderId,
        string? OrderCode,
        DateTime OrderDate,
        Guid StoreId,
        string StoreName,
        string ProductName,
        int Quantity,
        SalesCommissionType Type,
        decimal Value,
        decimal UnitPrice,
        decimal Amount,
        Currency Currency,
        SalesCommissionStatus Status,
        DateTimeOffset? PaidAt,
        string? PaymentNote);

    /// <summary>Catálogo web publicado de una tienda del Owner del gestor.</summary>
    public sealed record SalesManagerCatalogDto(
        Guid StoreId,
        string StoreName,
        string CatalogSlug);

    /// <summary>
    /// Vista del OWNER sobre una comisión de cualquiera de sus gestores. Incluye a quién se le
    /// debe y el pedido/línea que la originó; el pago completo se registra con T7.
    /// </summary>
    public sealed record OwnerSalesCommissionDto(
        Guid Id,
        Guid SalesManagerId,
        string SalesManagerName,
        string SalesManagerLogin,
        Guid OrderId,
        string? OrderCode,
        DateTime OrderDate,
        Guid StoreId,
        string StoreName,
        string ProductName,
        int Quantity,
        SalesCommissionType Type,
        decimal Value,
        decimal UnitPrice,
        decimal Amount,
        Currency Currency,
        SalesCommissionStatus Status,
        DateTimeOffset? PaidAt,
        string? PaymentNote);
}
