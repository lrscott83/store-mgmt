using Application.Abstractions.Messaging;
using Application.Dtos.Administration.Owners;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.Owners;
using Domain.Interfaces.Repositories;

namespace Application.Features.Administration.Owners.Queries.GetOwnerById
{
    public sealed record GetOwnerByIdQuery(Guid OwnerId) : IQuery<OwnerDto> { }

    public class GetOwnerByIdQueryHandler : IQueryHandler<GetOwnerByIdQuery, OwnerDto>
    {
        private readonly IOwnerRepository _ownerRepository;
        private readonly IMapper _mapper;

        public GetOwnerByIdQueryHandler(IOwnerRepository ownerRepository, IMapper mapper)
        {
            _ownerRepository = ownerRepository;
            _mapper = mapper;
        }

        public async Task<ResponseResult<OwnerDto>> Handle(GetOwnerByIdQuery query, CancellationToken cancellationToken)
        {
            Owner owner = await _ownerRepository.GetOwnerIncludingUserByIdAsync(query.OwnerId);
            OwnerDto ownerDto = _mapper.Map<OwnerDto>(owner);
            return ResponseResult.Success(ownerDto);
        }
    }
}
