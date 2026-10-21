using Domain.Common.Enums;

namespace Application.Features.WebCatalog.Public
{
    /// <summary>
    /// Tipo de dispositivo derivado del User-Agent. Es una aproximación para el panel; no se usa
    /// para ninguna decisión funcional.
    /// </summary>
    public static class CatalogDeviceClassifier
    {
        public static CatalogDeviceType Resolve(string? userAgent)
        {
            if (string.IsNullOrWhiteSpace(userAgent))
                return CatalogDeviceType.Unknown;

            string ua = userAgent.ToLowerInvariant();

            if (ua.Contains("ipad", StringComparison.Ordinal) || ua.Contains("tablet", StringComparison.Ordinal))
                return CatalogDeviceType.Tablet;

            if (ua.Contains("mobile", StringComparison.Ordinal) || ua.Contains("android", StringComparison.Ordinal)
                || ua.Contains("iphone", StringComparison.Ordinal))
                return CatalogDeviceType.Mobile;

            return CatalogDeviceType.Desktop;
        }
    }
}
