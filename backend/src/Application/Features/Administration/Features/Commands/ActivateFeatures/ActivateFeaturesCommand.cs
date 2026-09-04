using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Entities.Features;
using Domain.Entities.Modules;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Administration.Features.Commands.ActivateFeatures
{
    public sealed record ActivateFeaturesCommand: ICommand<bool>
    { }

    public class ActivateFeaturesCommandHandler : ICommandHandler<ActivateFeaturesCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IModuleRepository _moduleRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IFeatureRepository _featureRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public ActivateFeaturesCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            IModuleRepository moduleRepository,
            IFeatureRepository featureRepository)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _localizer = localizer;
            _moduleRepository = moduleRepository;
            _featureRepository = featureRepository;
        }

        public async Task<ResponseResult<bool>> Handle(ActivateFeaturesCommand request, CancellationToken cancellationToken)
        {
            if (!(_httpContextService.IsSuperAdmin))
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            Module statisticsModule = await _moduleRepository.GetByIdAsync((int)ModuleType.Statistics);
            if (statisticsModule != null)
            {
                statisticsModule.IsActive = true;
                statisticsModule.Price = 1000;
                await _moduleRepository.UpdateAsync(statisticsModule);
            }

            Feature dashboardFeature = await _featureRepository.GetByIdAsync((int)FeatureType.Dashboard);
            if (dashboardFeature != null)
            {
                dashboardFeature.IsActive = true;
                await _featureRepository.UpdateAsync(dashboardFeature);
            }

            Module reportsModule = await _moduleRepository.GetByIdAsync((int)ModuleType.Reports);
            if (reportsModule != null)
            {
                reportsModule.IsActive = true;
                await _moduleRepository.UpdateAsync(reportsModule);
            }

            Feature reportsFeature = await _featureRepository.GetByIdAsync((int)FeatureType.TodayReports);
            if (reportsFeature != null)
            {
                reportsFeature.IsActive = true;
                await _featureRepository.UpdateAsync(reportsFeature);
            }

            Feature egressFeature = await _featureRepository.GetByIdAsync((int)FeatureType.Egress);
            if (egressFeature == null)
            {
                egressFeature = Feature.Create(
                    (int)FeatureType.Egress,
                     FeatureType.Egress.GetDescription(),
                     "Funcionalidad para adicionar las salidas del inventario",
                     (int)ModuleType.Inventory,
                     71,
                     true,
                     true);
                await _featureRepository.AddAsync(egressFeature);
            }

            Feature warehousesFeature = await _featureRepository.GetByIdAsync((int)FeatureType.Warehouses);
            if (warehousesFeature == null)
            {
                warehousesFeature = Feature.Create(
                    (int)FeatureType.Warehouses,
                     FeatureType.Warehouses.GetDescription(),
                     "Funcionalidad para gestionar los almacenes y sus movimientos",
                     (int)ModuleType.Inventory,
                     72,
                     true,
                     true);
                await _featureRepository.AddAsync(warehousesFeature);
            }

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
