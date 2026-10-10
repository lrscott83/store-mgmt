using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.UpdateStoreCatalogTemplate
{
    /// <summary>
    /// Fija la PLANTILLA (vista) del catálogo público de UNA tienda.
    ///
    /// SuperAdmin only: la vista del catálogo es una decisión de PLATAFORMA, no de la tienda, así
    /// que no comparte endpoint con la marca del Owner (`WebCatalogAdmin`). Es la misma capacidad
    /// por-tienda que `{storeId}/module-pricing`.
    ///
    /// Escribe SOLO `TemplateId` de la fila por tienda (`StoreCatalogSettings`). Si la tienda
    /// todavía no tiene fila, la CREA con sus defaults (pedidos cerrados): fijar la plantilla no
    /// enciende los pedidos ni toca la marca. Nunca toca `PaletteId`, logo, banner ni las columnas
    /// de pedidos.
    /// </summary>
    public sealed record UpdateStoreCatalogTemplateCommand(Guid StoreId, string TemplateId)
        : ICommand<StoreCatalogTemplateDto>;

    internal sealed class UpdateStoreCatalogTemplateCommandHandler
        : ICommandHandler<UpdateStoreCatalogTemplateCommand, StoreCatalogTemplateDto>
    {
        private readonly IApplicationUnitOfWork _unitOfWork;
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IStoreCatalogSettingsRepository _settingsRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateStoreCatalogTemplateCommandHandler(
            IApplicationUnitOfWork unitOfWork,
            IGetStoreByIdService storeByIdService,
            IStoreCatalogSettingsRepository settingsRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _unitOfWork = unitOfWork;
            _storeByIdService = storeByIdService;
            _settingsRepository = settingsRepository;
            _httpContextService = httpContextService;
            _localizer = localizer;
        }

        public async Task<ResponseResult<StoreCatalogTemplateDto>> Handle(
            UpdateStoreCatalogTemplateCommand request, CancellationToken cancellationToken)
        {
            // SuperAdmin only. IsSuperAdminOrOwnerAdmin dejaría al Owner fijar la plantilla de su
            // tienda, que es justo lo que esta capacidad retira.
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);

            Store? store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(request.StoreId);
            if (store is null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            // Alta o actualización por `StoreId` (D7: una fila por tienda). Reutilizar la fila
            // cargada conserva SUS columnas (pedidos, marca): crear una nueva las traería en blanco.
            StoreCatalogSettings? settings = await _settingsRepository.GetByStoreIdAsync(request.StoreId);
            settings ??= StoreCatalogSettings.Create(request.StoreId, store.TenantId);

            settings.TemplateId = request.TemplateId.Trim();

            // NoTracking: el upsert marca la entidad explícitamente (Add o Modified).
            await _settingsRepository.UpsertAsync(settings);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

            return ResponseResult.Success(new StoreCatalogTemplateDto
            {
                StoreId = request.StoreId,
                TemplateId = settings.TemplateId,
            });
        }
    }
}
