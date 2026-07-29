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

namespace Application.Features.StoreManagement.Stores.Commands.SetStorePaymentDate
{
    public sealed record SetStorePaymentDateCommand(Guid StoreId, DateOnly PaymentStartDate) : ICommand<bool> { }

    public class SetStorePaymentDateCommandHandler : ICommandHandler<SetStorePaymentDateCommand, bool>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IGetStoreByIdService _storeByIdService;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IStringLocalizer<I18n> _localizer;

        public SetStorePaymentDateCommandHandler(
            IStoreRepository storeRepository,
            IGetStoreByIdService storeByIdService,
            IApplicationUnitOfWork applicationUnitOfWork,
            IHttpContextService httpContextService,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _storeByIdService = storeByIdService;
            _applicationUnitOfWork = applicationUnitOfWork;
            _httpContextService = httpContextService;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(SetStorePaymentDateCommand request, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            var store = await _storeByIdService.GetStoreByIdIncludingModulesAsync(request.StoreId);
            if (store is null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.BadRequest);
            store.PaymentStartDate = request.PaymentStartDate;

            await _storeRepository.UpdateAsync(store);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
