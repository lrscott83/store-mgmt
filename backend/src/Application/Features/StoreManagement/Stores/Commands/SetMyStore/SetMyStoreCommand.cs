using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.Stores;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.SetMyStore
{
    public sealed record SetMyStoreCommand(Guid StoreId) : ICommand<bool> { }

    public class SetMyStoreCommandHandler : ICommandHandler<SetMyStoreCommand, bool>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IUserRepository _userRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IStoreRepository _storeRepository;
        private readonly IStringLocalizer<I18n> _localizer;

        public SetMyStoreCommandHandler(
            IHttpContextService httpContextService,
            IUserRepository userRepository,
            IApplicationUnitOfWork applicationUnitOfWork,
            IStoreRepository storeRepository,
            IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
            _storeRepository = storeRepository;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(SetMyStoreCommand request, CancellationToken cancellationToken)
        {
            var user = await _userRepository.GetByIdAsync(_httpContextService.UserExternalId.ToGuid());
            if (user is null)
                throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);

            if (!_httpContextService.IsSuperAdmin)
            {
                var accessibleStores = await _storeRepository.GetActiveStoresByUserIdAsync(user.Id);
                if (!accessibleStores.Any(s => s.Id == request.StoreId))
                    throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);
            }

            user.SelectedStoreId = request.StoreId;
            await _userRepository.UpdateAsync(user);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
