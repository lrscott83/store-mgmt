using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Entities.StoreCatalogSettings;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Queries.GetStoreCatalogTemplate
{
    public sealed record GetStoreCatalogTemplateQuery(Guid StoreId) : IQuery<StoreCatalogTemplateDto>;

    /// <summary>
    /// La plantilla (vista) del catálogo público de UNA tienda, para el editor del SuperAdmin.
    ///
    /// SuperAdmin only, igual que la escritura (<c>UpdateStoreCatalogTemplateCommandHandler</c>):
    /// las dos mitades de la misma capacidad no pueden discrepar sobre quién puede usarla. Una
    /// tienda sin fila de configuración NO es un 404: devuelve la plantilla por defecto, porque una
    /// tienda recién creada tiene catálogo y todavía no tiene configuración.
    /// </summary>
    public class GetStoreCatalogTemplateQueryHandler
        : IQueryHandler<GetStoreCatalogTemplateQuery, StoreCatalogTemplateDto>
    {
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IStoreCatalogSettingsRepository _settingsRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetStoreCatalogTemplateQueryHandler(
            IGetStoreByIdService storeByIdService,
            IStoreCatalogSettingsRepository settingsRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _storeByIdService = storeByIdService;
            _settingsRepository = settingsRepository;
            _httpContextService = httpContextService;
            _localizer = localizer;
        }

        public async Task<ResponseResult<StoreCatalogTemplateDto>> Handle(
            GetStoreCatalogTemplateQuery query, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);

            Store? store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(query.StoreId);
            if (store is null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);

            StoreCatalogSettings? settings = await _settingsRepository.GetByStoreIdAsync(query.StoreId);

            return ResponseResult.Success(new StoreCatalogTemplateDto
            {
                StoreId = query.StoreId,
                TemplateId = string.IsNullOrWhiteSpace(settings?.TemplateId)
                    ? StoreCatalogSettings.DefaultTemplateId
                    : settings.TemplateId,
            });
        }
    }
}
