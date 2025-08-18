using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.DeleteStore
{
    public sealed record DeactivateStoreCommand (Guid Id) : ICommand<bool> { }

    public class DeleteStoreCommandHandler : ICommandHandler<DeactivateStoreCommand, bool>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public DeleteStoreCommandHandler(
            IStoreRepository storeRepository,
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer,
            IGetStoreByIdService storeByIdService)
        {
            _storeRepository = storeRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _localizer = localizer;
            _storeByIdService = storeByIdService;
        }


        public async Task<ResponseResult<bool>> Handle(DeactivateStoreCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            var store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(request.Id);
            store.IsActive = false;
            await _storeRepository.UpdateAsync(store);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
