using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using AutoMapper;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Billing;
using Domain.Interfaces.Services.Stores;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.CreateStore
{
    public sealed record CreateStoreCommand(Guid OwnerId, string Name, string? Address, string? Description, bool Approved, List<int> ModuleIds) 
        : ICommand<StoreDto> { }

    public class CreateStoreCommandHandler : ICommandHandler<CreateStoreCommand, StoreDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IOwnerRepository _ownerRepository;
        private readonly IStoreModuleRepository _storeModuleRepository;
        private readonly IBillingService _billingService;
        private readonly IHttpContextService _httpContextService;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly ICreateStoreService _createStoreService;

        public CreateStoreCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IOwnerRepository ownerRepository,
            IStoreModuleRepository storeModuleRepository,
            IBillingService billingService,
            IHttpContextService httpContextService,
            IMapper mapper,
            IStringLocalizer<I18n> localizer,
            ICreateStoreService createStoreService)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _storeModuleRepository = storeModuleRepository;
            _billingService = billingService;
            _httpContextService = httpContextService;
            _ownerRepository = ownerRepository;
            _mapper = mapper;
            _localizer = localizer;
            _createStoreService = createStoreService;
        }

        public async Task<ResponseResult<StoreDto>> Handle(CreateStoreCommand request, CancellationToken cancellationToken)
        {
            // Gate 2: StoreUser (even holding feature 73 via StoreRoleFeature) and any other
            // non-owner, non-superadmin caller is rejected here. The action gate admits StoresAdmin
            // by feature; the handler re-verifies the ROLE (defense-in-depth, see D1).
            if (!_httpContextService.IsSuperAdmin && !_httpContextService.IsOwnerAdmin)
                throw new ApiException(_localizer["NotAuthorized"], HttpStatusCode.Forbidden);

            var ownerId = request.OwnerId;
            List<int> moduleIds = request.ModuleIds;
            var approved = request.Approved;

            if (_httpContextService.IsOwnerAdmin)
            {
                // Owner branch (user-approved: OwnerAdmin WITH MultiStores may create for SELF only).
                // Body OwnerId is not trusted: zero-Guid means "derive mine"; any other value must be
                // the caller's own owner or the request is rejected (fail-closed, mirrors
                // SetStoreActivation's ownership stance).
                var ownOwner = await _ownerRepository.GetByUserIdIgnoreQueryFiltersAsync(_httpContextService.UserExternalId.ToGuid());
                if (ownOwner is null)
                    throw new ApiException(_localizer["NotAuthorized"], HttpStatusCode.Forbidden);

                if (request.OwnerId != Guid.Empty && request.OwnerId != ownOwner.Id)
                    throw new ApiException(_localizer["NotAuthorized"], HttpStatusCode.Forbidden);

                var selectedStoreId = _httpContextService.StoreId.ToGuid();
                if (selectedStoreId == Guid.Empty)
                    throw new ApiException(_localizer["NotAuthorized"], HttpStatusCode.Forbidden);

                // MultiStores (14) must be active on the SELECTED store after billing filtering —
                // exact session parity with the frontend button gate (GetMeQuery shape).
                var storeModules = await _storeModuleRepository.GetAvailableModulesByStoreIdAsync(selectedStoreId);
                var billing = await _billingService.GetStoreBillingSummaryAsync(selectedStoreId);
                if (!StoreBillingUtils.FilterForBilling(storeModules, billing).Contains((int)ModuleType.MultiStores))
                    throw new ApiException(_localizer["NotAuthorized"], HttpStatusCode.Forbidden);

                // Inheritance (user decision 3): the new store copies the SELECTED store's module set.
                var inheritedModules = await _storeModuleRepository.GetStoreModulesByIdAsync(selectedStoreId);
                moduleIds = inheritedModules.Select(sm => sm.ModuleId).ToList();
                if (moduleIds.Count == 0)
                    throw new ApiException(_localizer["NotAuthorized"], HttpStatusCode.Forbidden);

                ownerId = ownOwner.Id;
                approved = true; // user decision 6: owner-created stores are usable immediately
            }

            var owner = await _ownerRepository.GetOwnerIncludingUserByIdAsync(ownerId);
            var store = await _createStoreService.CreateStoreAsync(ownerId, owner.TenantId, request.Name, request.Address, 
                request.Description, approved, moduleIds);

            return await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0
                ? ResponseResult.Success(_mapper.Map<StoreDto>(store)) 
                : ResponseResult.Failure<StoreDto>(StoreErrors.NotCreated, (int)HttpStatusCode.BadRequest);
        }
    }
}
