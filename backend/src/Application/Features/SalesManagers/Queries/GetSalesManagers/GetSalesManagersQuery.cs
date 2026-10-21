using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.SalesManagers;
using Application.Exceptions;
using Application.ResponseModels;
using Domain.Common.Extensions;
using Domain.Entities.Owners;
using Domain.Entities.SalesManagers;
using Domain.Interfaces.Repositories;
using System.Net;

namespace Application.Features.SalesManagers.Queries.GetSalesManagers
{
    public sealed record GetSalesManagersQuery(bool IncludeInactive) : IQuery<List<SalesManagerDto>>;

    /// <summary>Lista los gestores del Owner autenticado. Owner-only.</summary>
    public class GetSalesManagersQueryHandler
        : IQueryHandler<GetSalesManagersQuery, List<SalesManagerDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IOwnerRepository _ownerRepository;
        private readonly ISalesManagerRepository _salesManagerRepository;

        public GetSalesManagersQueryHandler(
            IHttpContextService httpContextService,
            IOwnerRepository ownerRepository,
            ISalesManagerRepository salesManagerRepository)
        {
            _httpContextService = httpContextService;
            _ownerRepository = ownerRepository;
            _salesManagerRepository = salesManagerRepository;
        }

        public async Task<ResponseResult<List<SalesManagerDto>>> Handle(
            GetSalesManagersQuery request,
            CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsOwnerAdmin)
                throw new ApiException("Solo el Owner puede ver sus gestores de ventas.", HttpStatusCode.Forbidden);

            Guid ownerUserId = _httpContextService.UserExternalId.ToGuid();
            Owner? owner = await _ownerRepository.GetByUserIdIgnoreQueryFiltersAsync(ownerUserId);
            if (owner is null || !owner.IsActive)
                throw new ApiException("Owner no encontrado.", HttpStatusCode.Forbidden);

            IReadOnlyList<SalesManager> managers = await _salesManagerRepository
                .GetByOwnerIdAsync(owner.Id, request.IncludeInactive);

            List<SalesManagerDto> result = managers
                .Select(m => new SalesManagerDto(
                    m.Id,
                    m.UserId,
                    m.User.Login,
                    m.User.FullName,
                    m.User.CellPhone,
                    m.User.Email,
                    m.IsActive))
                .ToList();

            return ResponseResult.Success(result);
        }
    }
}
