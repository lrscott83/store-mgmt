using Application.Dtos.OnlineOrdering;
using Domain.Entities.StoreCatalogSettings;

namespace Application.Features.OnlineOrdering
{
    /// <summary>
    /// Proyección ÚNICA de la fila compartida (D19) a lo que ve la vista de PEDIDOS: solo columnas
    /// de pedidos. Existía copiada en el alta y en la lectura, y dos copias del mismo mapeo divergen
    /// en cuanto una añade un campo.
    ///
    /// El mapeo es explícito (no un spread) para que un campo nuevo de la entidad no aparezca por
    /// accidente: la marca (<c>LogoKey</c>/<c>BannerKey</c>/<c>PaletteId</c>/<c>TemplateId</c>) NO
    /// debe salir de aquí.
    /// </summary>
    internal static class StoreCatalogSettingsDtoMapper
    {
        public static StoreCatalogSettingsDto ToDto(StoreCatalogSettings settings) => new()
        {
            Enabled = settings.Enabled,
            WhatsappNumber = settings.WhatsappNumber,
            PickupEnabled = settings.PickupEnabled,
            DeliveryEnabled = settings.DeliveryEnabled,
            BusinessHours = settings.BusinessHours,
            DeliveryZones = settings.DeliveryZones,
            SyncedAt = settings.SyncedAt,
        };

        /// <summary>
        /// Valores por defecto cuando la tienda todavía NO tiene fila: pedidos cerrados, sin número
        /// ni modalidades. Explícito, para que añadir un campo a la entidad no se olvide aquí.
        /// </summary>
        public static StoreCatalogSettingsDto Default() => new()
        {
            Enabled = false,
            WhatsappNumber = null,
            PickupEnabled = false,
            DeliveryEnabled = false,
            BusinessHours = null,
            DeliveryZones = null,
            SyncedAt = null,
        };
    }
}
