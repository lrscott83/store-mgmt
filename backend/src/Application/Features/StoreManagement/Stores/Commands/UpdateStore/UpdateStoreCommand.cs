using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Entities.Modules;
using Domain.Entities.Owners;
using Domain.Entities.StoreModules;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.UpdateStore
{
    public sealed record UpdateStoreCommand(Guid Id, string Name, string? Address, string? Description, 
        bool Approved, DateTime? PaymentStartDate, List<int> ModuleIds, bool IsActive)
        : ICommand<bool> { }

    public class UpdateStoreCommandHandler : ICommandHandler<UpdateStoreCommand, bool>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IStoreRepository _storeRepository;
        private readonly IModuleRepository _moduleRepository;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public UpdateStoreCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IStoreRepository storeRepository,
            IModuleRepository moduleRepository,
            IStoreModuleRepository storeModuleRepository,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            IGetStoreByIdService storeByIdService)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _storeRepository = storeRepository;
            _moduleRepository = moduleRepository;
            _storeModuleRepository = storeModuleRepository;
            _localizer = localizer;
            _storeByIdService = storeByIdService;
        }

        public async Task<ResponseResult<bool>> Handle(UpdateStoreCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            if (_httpContextService.IsSuperAdmin && !request.PaymentStartDate.HasValue)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            var store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(request.Id);
            if (_storeRepository.Where(s => s.Id != request.Id).Any(s => s.Name == request.Name))
                throw new ValidationException(_localizer["StoreAlreadyExists"]);

            store.Name = request.Name;
            store.Address = request.Address;
            
            if (_httpContextService.IsSuperAdmin && request.PaymentStartDate.HasValue)
                store.PaymentStartDate = DateOnly.FromDateTime(request.PaymentStartDate.Value);
            if (_httpContextService.IsSuperAdmin)
            {
                store.Description = request.Description;
                store.Approved = request.Approved;
                store.IsActive = request.IsActive;
            }
            await _storeRepository.UpdateAsync(store);
            await UpdateStoreModules(store.Id, store.TenantId, request.ModuleIds);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }

        private async Task UpdateStoreModules(Guid storeId, Guid tenantId, List<int> moduleIds)
        {
            IEnumerable<StoreModule> storeModules = await _storeModuleRepository.GetStoreModulesByIdAsync(storeId);

            // Delete
            IEnumerable<StoreModule> storeModulesToDelete = storeModules
                .Where(module => module.IsActive && moduleIds.All(id => module.ModuleId != id))
                .ToList();
            if (storeModulesToDelete.Any())
                await _storeModuleRepository.DeleteAsync(storeModulesToDelete);

            foreach (var moduleId in moduleIds)
            {
                StoreModule? storeModule = storeModules.FirstOrDefault(module => module.ModuleId == moduleId);
                if (storeModule == null)
                {
                    // Insert
                    Module module = await _moduleRepository.GetByIdAsync(moduleId);
                    storeModule = StoreModule.Create(storeId, moduleId, module.Price, module.PriceIncluded,
                        module.Price, module.DiscountPrice, module.PercentDiscountPrice, tenantId);
                    await _storeModuleRepository.AddAsync(storeModule);
                }
                else if (!storeModule.IsActive)
                {
                    // Update
                    storeModule.IsActive = true;
                    await _storeModuleRepository.UpdateAsync(storeModule);
                }
            }
        }
    }
}
