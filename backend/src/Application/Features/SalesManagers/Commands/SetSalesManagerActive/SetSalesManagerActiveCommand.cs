using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Exceptions;
using Application.ResponseModels;
using Application.UnitOfWorks;
using Domain.Common.Extensions;
using Domain.Entities.Owners;
using Domain.Entities.SalesManagers;
using Domain.Interfaces.Repositories;
using System.Net;

namespace Application.Features.SalesManagers.Commands.SetSalesManagerActive
{
    public sealed record SetSalesManagerActiveCommand(Guid Id, bool IsActive) : ICommand<bool>;

    /// <summary>
    /// Activa/desactiva un gestor del Owner autenticado. La baja es lógica (`IsActive`) y el
    /// login/claims la rechazan (T4 + follow-up R1-INACTIVE-MANAGER-RESOLUTION).
    /// </summary>
    public class SetSalesManagerActiveCommandHandler
        : ICommandHandler<SetSalesManagerActiveCommand, bool>
    {
        private readonly IApplicationUnitOfWork _unitOfWork;
        private readonly IHttpContextService _httpContextService;
        private readonly IOwnerRepository _ownerRepository;
        private readonly ISalesManagerRepository _salesManagerRepository;

        public SetSalesManagerActiveCommandHandler(
            IApplicationUnitOfWork unitOfWork,
            IHttpContextService httpContextService,
            IOwnerRepository ownerRepository,
            ISalesManagerRepository salesManagerRepository)
        {
            _unitOfWork = unitOfWork;
            _httpContextService = httpContextService;
            _ownerRepository = ownerRepository;
            _salesManagerRepository = salesManagerRepository;
        }

        public async Task<ResponseResult<bool>> Handle(
            SetSalesManagerActiveCommand request,
            CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsOwnerAdmin)
                throw new ApiException("Solo el Owner puede administrar sus gestores de ventas.", HttpStatusCode.Forbidden);

            Guid ownerUserId = _httpContextService.UserExternalId.ToGuid();
            Owner? owner = await _ownerRepository.GetByUserIdIgnoreQueryFiltersAsync(ownerUserId);
            if (owner is null || !owner.IsActive)
                throw new ApiException("Owner no encontrado.", HttpStatusCode.Forbidden);

            SalesManager? manager = await _salesManagerRepository.GetByIdAsync(request.Id);
            if (manager is null || manager.OwnerId != owner.Id)
                throw new ApiException("Gestor no encontrado.", HttpStatusCode.NotFound);

            manager.IsActive = request.IsActive;
            await _salesManagerRepository.UpdateAsync(manager);

            return ResponseResult.Success(await _unitOfWork.SaveChangesAsync(cancellationToken) > 0);
        }
    }
}
