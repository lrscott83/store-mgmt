using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.DeleteStore
{
    public sealed record DeactivateStoreCommand (Guid Id) : ICommand<bool> { }

    public class DeleteStoreCommandHandler : ICommandHandler<DeactivateStoreCommand, bool>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public DeleteStoreCommandHandler(
            IStoreRepository storeRepository,
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _localizer = localizer;
        }


        public async Task<ResponseResult<bool>> Handle(DeactivateStoreCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["DontHavePermission"], HttpStatusCode.Forbidden);

            var store = await _storeRepository.GetStoreByIdAsync(request.Id);
            if (store is null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound);
            store.IsActive = false;
            await _storeRepository.UpdateAsync(store);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
