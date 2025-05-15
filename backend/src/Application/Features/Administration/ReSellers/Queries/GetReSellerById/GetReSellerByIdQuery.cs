using Application.Abstractions.Messaging;
using Application.Dtos.Administration.ReSellers;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;

namespace Application.Features.Administration.ReSellers.Queries.GetReSellerById
{
    public sealed record GetReSellerByIdQuery(Guid ReSellerId) : IQuery<ReSellerDto> { }

    public class GetReSellerByIdQueryHandler : IQueryHandler<GetReSellerByIdQuery, ReSellerDto>
    {
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IMapper _mapper;

        public GetReSellerByIdQueryHandler(IReSellerRepository reSellerRepository, IMapper mapper)
        {
            _reSellerRepository = reSellerRepository;
            _mapper = mapper;
        }

        public async Task<ResponseResult<ReSellerDto>> Handle(GetReSellerByIdQuery query, CancellationToken cancellationToken)
        {
            ReSeller reSeller = await _reSellerRepository.GetReSellerIncludingUserByIdAsync(query.ReSellerId);
            ReSellerDto reSellerDto = _mapper.Map<ReSellerDto>(reSeller);
            return ResponseResult.Success(reSellerDto);
        }
    }
}
