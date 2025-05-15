using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Interfaces.Repositories;

namespace Application.Features.ApplicationManagement.Tenants.Commands.SetMyTenant
{
    public sealed record SetMyTenantCommand(Guid TenantId) 
        : ICommand<bool> { }

    public class SetTenantCommandHandler : ICommandHandler<SetMyTenantCommand, bool>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IUserRepository _userRepository;
        private readonly IApplicationUnitOfWork _applicationUnitOfWork;


        public SetTenantCommandHandler(
            IHttpContextService httpContextService, 
            IUserRepository userRepository, 
            IApplicationUnitOfWork applicationUnitOfWork)
        {
            _httpContextService = httpContextService;
            _userRepository = userRepository;
            _applicationUnitOfWork = applicationUnitOfWork;
        }

        public async Task<ResponseResult<bool>> Handle(SetMyTenantCommand request, CancellationToken cancellationToken)
        {
            var user = await _userRepository.GetByIdAsync(_httpContextService.UserExternalId.ToGuid());

            user.SetTenantId(request.TenantId);

            return ResponseResult.Success(await _applicationUnitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
