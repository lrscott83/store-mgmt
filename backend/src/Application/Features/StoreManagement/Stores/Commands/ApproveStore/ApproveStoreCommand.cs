using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.StoreManagement.Stores.Commands.ApproveStore
{
    public sealed record ApproveStoreCommand(Guid Id) : ICommand<bool> { }

    public class ApproveStoreCommandHandler : ICommandHandler<ApproveStoreCommand, bool>
    {
        private readonly IStoreRepository _storeRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;
        private readonly IStringLocalizer<I18n> _localizer;

        public ApproveStoreCommandHandler(
            IStoreRepository storeRepository,
            IApplicationUnitOfWork applicationUnitOfWork,
            IStringLocalizer<I18n> localizer)
        {
            _storeRepository = storeRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
            _localizer = localizer;
        }

        public async Task<ResponseResult<bool>> Handle(ApproveStoreCommand request, CancellationToken cancellationToken)
        {
            var store = await _storeRepository.GetStoreByIdAsync(request.Id);
            if (store is null)
                throw new ApiException(_localizer["StoreNotFound"], HttpStatusCode.NotFound)
                {
                    AcctionCode = "StoreNotFound"
                };

            store.Approved = true;
            await _storeRepository.UpdateAsync(store);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
