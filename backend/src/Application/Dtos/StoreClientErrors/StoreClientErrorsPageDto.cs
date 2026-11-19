namespace Application.Dtos.StoreClientErrors
{
    /// <summary>
    /// Una página de errores del cliente POS tal como la consume la pantalla SuperAdmin
    /// (`pos-client-error-logs`, spec S6). `Page` y `PageSize` son los valores EFECTIVOS que el
    /// handler aplicó: el cliente los ecoa en vez de recalcular el recorte.
    /// </summary>
    public sealed class StoreClientErrorsPageDto
    {
        public int TotalCount { get; set; }
        public int Page { get; set; }
        public int PageSize { get; set; }
        public List<StoreClientErrorItemDto> Items { get; set; } = new();
    }

    /// <summary>
    /// Una fila del panel. `OwnerName` y `StoreName` son NULL cuando el error no tiene tienda
    /// (spec S4: ocurrió antes de existir una sesión); la vista pinta un guion.
    /// </summary>
    public sealed class StoreClientErrorItemDto
    {
        public Guid Id { get; set; }
        public Guid? StoreId { get; set; }
        public string? OwnerName { get; set; }
        public string? StoreName { get; set; }
        public string Message { get; set; } = string.Empty;
        public string? Route { get; set; }
        public string? Location { get; set; }
        public int Count { get; set; }
        public string? Context { get; set; }
        public string? AppVersion { get; set; }
        public string? Device { get; set; }
        public DateTime OccurredAt { get; set; }
        public DateTime ReceivedAt { get; set; }
    }
}
