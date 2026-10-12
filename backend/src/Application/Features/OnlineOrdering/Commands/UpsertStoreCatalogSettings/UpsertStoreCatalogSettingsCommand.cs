using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Abstractions.Time;
using Application.Dtos.OnlineOrdering;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.OnlineOrdering.Commands.UpsertStoreCatalogSettings
{
    /// <summary>
    /// Guarda la configuración de pedidos de la tienda del contexto (el botón "Sincronizar" de la
    /// vista Pedidos WhatsApp, F1). Gemelo del "Sincronizar Catálogo": la UI envía lo que el dueño
    /// escribió y el servidor decide si eso se puede guardar.
    ///
    /// El payload es la fila COMPLETA de pedidos, no un parche: la vista manda todo lo que hay
    /// escrito y el servidor resuelve alta o actualización por `StoreId`.
    ///
    /// NO lleva `StoreId`: la tienda es la del contexto. Aceptarlo en el cuerpo dejaría que un
    /// dueño escribiera la configuración de la tienda de otro.
    /// </summary>
    public sealed class UpsertStoreCatalogSettingsCommand : ICommand<StoreCatalogSettingsDto>
    {
        // Límites de formato de la ENTRADA. Son los de las COLUMNAS —los declara la entidad
        // (`StoreCatalogSettings.*MaxLength`, dueña del esquema)—, no una decisión estética: un valor
        // más largo no lo recorta la base, lo revienta con un 500 en el INSERT. Aquí se convierte en
        // un 400 con mensaje. Se re-exponen en el comando para no cambiar sus llamadores.

        /// <summary>Teléfono con prefijo internacional (D17). 32 como `Order.CustomerPhone`.</summary>
        public const int WhatsappNumberMaxLength = StoreCatalogSettings.WhatsappNumberMaxLength;

        /// <summary>Horario como texto libre (D16).</summary>
        public const int BusinessHoursMaxLength = StoreCatalogSettings.BusinessHoursMaxLength;

        /// <summary>Zonas de reparto como texto libre (D16).</summary>
        public const int DeliveryZonesMaxLength = StoreCatalogSettings.DeliveryZonesMaxLength;

        /// <summary>Interruptor maestro: sin esto la tienda NO acepta pedidos.</summary>
        public bool Enabled { get; set; }

        /// <summary>Número de WhatsApp. Obligatorio con <see cref="Enabled"/> (ver el validador).</summary>
        public string? WhatsappNumber { get; set; }

        /// <summary>Admite recogida en la tienda.</summary>
        public bool PickupEnabled { get; set; }

        /// <summary>Admite envío a domicilio.</summary>
        public bool DeliveryEnabled { get; set; }

        /// <summary>Horario de atención (texto simple, D16).</summary>
        public string? BusinessHours { get; set; }

        /// <summary>Zonas de reparto (texto simple, D16).</summary>
        public string? DeliveryZones { get; set; }
    }

    public class UpsertStoreCatalogSettingsCommandHandler
        : ICommandHandler<UpsertStoreCatalogSettingsCommand, StoreCatalogSettingsDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IDateTimeProvider _dateTimeProvider;
        private readonly IStoreRepository _storeRepository;
        private readonly IStoreCatalogSettingsRepository _storeCatalogSettingsRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpsertStoreCatalogSettingsCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IDateTimeProvider dateTimeProvider,
            IStoreRepository storeRepository,
            IStoreCatalogSettingsRepository storeCatalogSettingsRepository,
            IStringLocalizer<I18n> localizer)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _dateTimeProvider = dateTimeProvider;
            _storeRepository = storeRepository;
            _storeCatalogSettingsRepository = storeCatalogSettingsRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<StoreCatalogSettingsDto>> Handle(
            UpsertStoreCatalogSettingsCommand request, CancellationToken cancellationToken)
        {
            Guid storeId = _httpContextService.StoreId.ToGuid();
            if (storeId == Guid.Empty)
                throw new ApiException(_localizer["StoreNotSelected", _httpContextService.UserExternalId], HttpStatusCode.BadRequest);

            // Alta o actualización por `StoreId` (D7: una fila por tienda, índice único).
            // Reutilizar la fila cargada conserva SU `Id`: cambiarlo convertiría el guardado en un
            // INSERT que chocaría con ese índice único.
            StoreCatalogSettings? settings = await _storeCatalogSettingsRepository.GetByStoreIdAsync(storeId);
            bool exists = settings is not null;

            if (!exists)
            {
                // El `TenantId` de la fila sale de la TIENDA, no del claim de quien llama. Un
                // SuperAdmin escribiendo una tienda de OTRO tenant sellaría la fila con su propio
                // tenant: el owner no la vería (filtro global) y no podría actualizarla nunca (cada
                // PUT chocaría con el índice único). La tienda es la fuente de verdad de su tenant.
                Store? store = await _storeRepository.GetStoreByIdAsync(storeId);
                if (store is null)
                    throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound);

                settings = StoreCatalogSettings.Create(storeId, store.TenantId);
            }

            ApplyOrderingSettings(request, settings);

            // `SyncedAt` sale del reloj inyectado, no de `DateTime.Now`: es el sello que la vista
            // muestra y tiene que ser comprobable.
            settings.SyncedAt = _dateTimeProvider.UtcNow;

            // El upsert escribe SOLO las columnas de pedidos: la fila la comparte la marca (D19), así
            // que un UPDATE de fila completa revertiría un cambio de marca concurrente.
            // `ApplicationDbContext` es NoTracking, así que mutar la fila cargada y llamar a
            // `SaveChanges` sin marcar no escribiría NADA — sin error y sin aviso.
            await _storeCatalogSettingsRepository.UpsertAsync(settings, exists,
                nameof(StoreCatalogSettings.Enabled),
                nameof(StoreCatalogSettings.WhatsappNumber),
                nameof(StoreCatalogSettings.PickupEnabled),
                nameof(StoreCatalogSettings.DeliveryEnabled),
                nameof(StoreCatalogSettings.BusinessHours),
                nameof(StoreCatalogSettings.DeliveryZones),
                nameof(StoreCatalogSettings.SyncedAt));
            await _applicationUnitOfWork.SaveChangesAsync(cancellationToken);

            return ResponseResult.Success(StoreCatalogSettingsDtoMapper.ToDto(settings));
        }

        /// <summary>
        /// Escribe SOLO las columnas de pedidos (D19). La marca —<c>LogoKey</c>, <c>BannerKey</c> y
        /// <c>PaletteId</c>— es de F8 y de la vista Catálogo Web: si este método las tocara, cada
        /// vez que el dueño guardara los pedidos perdería el logo y la paleta que configuró allí.
        /// Su ausencia aquí ES el comportamiento, no un olvido.
        ///
        /// El texto se limpia de espacios: un número con espacios rompería el enlace `wa.me`, y un
        /// string en blanco se guarda como null (que es "sin valor"), no como `""`.
        /// </summary>
        private static void ApplyOrderingSettings(UpsertStoreCatalogSettingsCommand request, StoreCatalogSettings settings)
        {
            settings.Enabled = request.Enabled;
            settings.WhatsappNumber = Trim(request.WhatsappNumber);
            settings.PickupEnabled = request.PickupEnabled;
            settings.DeliveryEnabled = request.DeliveryEnabled;
            settings.BusinessHours = Trim(request.BusinessHours);
            settings.DeliveryZones = Trim(request.DeliveryZones);
        }

        /// <summary>Texto limpio: sin bordes y `null` si no queda nada (D16: texto libre del dueño).</summary>
        private static string? Trim(string? value)
            => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
}