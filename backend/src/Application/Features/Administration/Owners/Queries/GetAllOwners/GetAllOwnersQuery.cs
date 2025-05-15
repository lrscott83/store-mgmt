using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Administration.Owners;
using Application.Exceptions;
using Application.ResponseModels;
using AutoMapper;
using Domain.Common.Extensions;
using Domain.Entities.Owners;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Administration.Owners.Queries.GetAllOwners
{
    public sealed record GetAllOwnersQuery(bool IncludeInactive) : IQuery<IEnumerable<OwnerDto>>
    { }

    public class GetAllOwnersQueryHandler : IQueryHandler<GetAllOwnersQuery, IEnumerable<OwnerDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IOwnerRepository _ownerRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetAllOwnersQueryHandler(IHttpContextService httpContextService, IOwnerRepository ownerRepository, 
            IMapper mapper, IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _ownerRepository = ownerRepository;
            _mapper = mapper;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<OwnerDto>>> Handle(GetAllOwnersQuery query, CancellationToken cancellationToken)
        {
            if (!(_httpContextService.IsSuperAdmin || _httpContextService.IsReSeller))
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            IEnumerable<Owner> owners = _httpContextService.IsSuperAdmin
                ? await _ownerRepository.GetAllOwnersIncludingStoreModulesAsync(query.IncludeInactive)
                : await _ownerRepository.GetReSellerOwnersIncludingStoreModulesAsync(_httpContextService.UserExternalId.ToGuid(), query.IncludeInactive);
            IEnumerable<OwnerDto> ownerDtos = _mapper.Map<IEnumerable<OwnerDto>>(owners).ToList();
            return ResponseResult.Success(ownerDtos);
        }
    }
}
