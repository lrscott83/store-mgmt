using Application.Abstractions.Messaging;
using Application.Dtos.Administration.Owners;
using Application.ResponseModels;
using AutoMapper;
using Domain.Common.Results;
using Domain.Entities.Owners;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Administration.Owners.Queries.GetOwnerById
{
    public sealed record GetOwnerByIdQuery(Guid OwnerId) : IQuery<OwnerDto> { }

    public class GetOwnerByIdQueryHandler : IQueryHandler<GetOwnerByIdQuery, OwnerDto>
    {
        private readonly IOwnerRepository _ownerRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetOwnerByIdQueryHandler(IOwnerRepository ownerRepository, IMapper mapper, IStringLocalizer<I18n> localizer)
        {
            _ownerRepository = ownerRepository;
            _mapper = mapper;
            _localizer = localizer;
        }

        public async Task<ResponseResult<OwnerDto>> Handle(GetOwnerByIdQuery query, CancellationToken cancellationToken)
        {
            Owner? owner = await _ownerRepository.GetOwnerIncludingUserByIdAsync(query.OwnerId, cancellationToken);

            if (owner is null)
                return ResponseResult.Failure<OwnerDto>(new Error("Owner.NotFound", _localizer["OwnerNotFound"]), (int)HttpStatusCode.NotFound);

            OwnerDto ownerDto = _mapper.Map<OwnerDto>(owner);
            return ResponseResult.Success(ownerDto);
        }
    }
}
