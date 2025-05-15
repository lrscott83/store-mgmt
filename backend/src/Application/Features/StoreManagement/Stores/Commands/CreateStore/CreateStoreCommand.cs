using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.StoreManagement;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using AutoMapper;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;
using Domain.Interfaces.Services.Stores;

namespace Application.Features.StoreManagement.Stores.Commands.CreateStore
{
    public sealed record CreateStoreCommand(Guid OwnerId, string Name, string? Address, string? Description, bool Approved, List<int> ModuleIds) 
        : ICommand<StoreDto> { }

    public class CreateStoreCommandHandler : ICommandHandler<CreateStoreCommand, StoreDto>
    {
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IOwnerRepository _ownerRepository;
        private readonly IUserRepository _userRepository;
        private readonly IHttpContextService _httpContextService;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;
        private readonly ICreateStoreService _createStoreService;

        public CreateStoreCommandHandler(
            IApplicationUnitOfWork applicationUnitOfWork,
            IOwnerRepository ownerRepository,
            IUserRepository userRepository,
            IHttpContextService httpContextService,
            IMapper mapper,
            IStringLocalizer<I18n> localizer,
            ICreateStoreService createStoreService)
        {
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _ownerRepository = ownerRepository;
            _userRepository = userRepository;
            _mapper = mapper;
            _localizer = localizer;
            _createStoreService = createStoreService;
        }

        public async Task<ResponseResult<StoreDto>> Handle(CreateStoreCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            var owner = await _ownerRepository.GetOwnerIncludingUserByIdAsync(request.OwnerId);
            var store = await _createStoreService.CreateStoreAsync(request.OwnerId, owner.TenantId, request.Name, request.Address, 
                request.Description, request.Approved, request.ModuleIds);

            if (_httpContextService.IsOwnerAdmin)
            {
                owner.User.SelectedStoreId = store.Id;
                await _userRepository.UpdateAsync(owner.User);
            }

            return await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0
                ? ResponseResult.Success(_mapper.Map<StoreDto>(store)) 
                : ResponseResult.Failure<StoreDto>(StoreErrors.NotCreated, (int)HttpStatusCode.BadRequest);
        }
    }
}
