using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Administration.ReSellers;
using Application.Exceptions;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.ReSellers;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Administration.ReSellers.Queries.GetAllReSellers
{
    public sealed record GetAllReSellersQuery(bool IncludeInactive) : IQuery<IEnumerable<ReSellerDto>>
    { }

    public class GetAllReSellersQueryHandler : IQueryHandler<GetAllReSellersQuery, IEnumerable<ReSellerDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IReSellerRepository _reSellerRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetAllReSellersQueryHandler(IHttpContextService httpContextService, IReSellerRepository reSellerRepository,
            IMapper mapper, IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _reSellerRepository = reSellerRepository;
            _mapper = mapper;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<ReSellerDto>>> Handle(GetAllReSellersQuery query, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            IEnumerable<ReSeller> reSellers = await _reSellerRepository.GetAllReSellersIncludingUserAsync(query.IncludeInactive);
            IEnumerable<ReSellerDto> reSellerDtos = _mapper.Map<IEnumerable<ReSellerDto>>(reSellers).ToList();
            return ResponseResult.Success(reSellerDtos);
        }
    }
}
