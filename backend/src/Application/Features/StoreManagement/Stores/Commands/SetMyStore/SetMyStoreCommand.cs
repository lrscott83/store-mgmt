using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;

namespace Application.Features.StoreManagement.Stores.Commands.SetMyStore
{
    public sealed record SetMyStoreCommand(Guid StoreId) : ICommand<bool> { }

    public class SetStoreCommandHandler : ICommandHandler<SetMyStoreCommand, bool>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IUserRepository _userRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;


        public SetStoreCommandHandler(
            IHttpContextService httpContextService,
            IUserRepository userRepository,
            IApplicationUnitOfWork applicationUnitOfWork)
        {
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
        }

        public async Task<ResponseResult<bool>> Handle(SetMyStoreCommand request, CancellationToken cancellationToken)
        {
            var user = await _userRepository.GetByIdAsync(_httpContextService.UserExternalId.ToGuid());
            user.SelectedStoreId = request.StoreId;
            await _userRepository.UpdateAsync(user);
            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
