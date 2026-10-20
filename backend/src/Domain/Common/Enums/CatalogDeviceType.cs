namespace Domain.Common.Enums
{
    /// <summary>Tipo de dispositivo del visitante, derivado del User-Agent en el servidor.</summary>
    public enum CatalogDeviceType : int
    {
        Unknown = 0,
        Desktop = 1,
        Mobile = 2,
        Tablet = 3,
    }
}
