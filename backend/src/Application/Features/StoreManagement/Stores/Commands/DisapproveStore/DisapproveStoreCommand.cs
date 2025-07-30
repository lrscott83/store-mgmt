using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Interfaces.Repositories;
using Domain.Interfaces.Services.Stores;
using Microsoft.Extensions.Localization;
using Resources;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading.Tasks;

namespace Application.Features.StoreManagement.Stores.Commands.DisapproveStore
{
    public sealed record DisapproveStoreCommand(Guid Id) : ICommand<bool> { }

    public class DisapproveStoreCommandHandler : ICommandHandler<DisapproveStoreCommand, bool>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public DisapproveStoreCommandHandler(
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


        public async Task<ResponseResult<bool>> Handle(DisapproveStoreCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            var store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(request.Id);
            store.Approved = false;
            await _storeRepository.UpdateAsync(store);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
