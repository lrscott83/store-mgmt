using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Administration.Features;
using Application.Exceptions;
using Application.ResponseModels;
using AutoMapper;
using Domain.Entities.Features;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Administration.Features.Queries.GetAvailableFeaturesToStore
{
    public sealed record GetAvailableFeaturesToStoreQuery : IQuery<IEnumerable<FeatureDto>>
    { }

    public class GetAvailableFeaturesToStoreQueryHandler : IQueryHandler<GetAvailableFeaturesToStoreQuery, IEnumerable<FeatureDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IFeatureRepository _featureRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetAvailableFeaturesToStoreQueryHandler(IHttpContextService httpContextService, IFeatureRepository featureRepository,
            IMapper mapper, IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _featureRepository = featureRepository;
            _mapper = mapper;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<FeatureDto>>> Handle(GetAvailableFeaturesToStoreQuery query, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            IEnumerable<Feature> features = await _featureRepository.GetAvailableFeaturesToStore();
            IEnumerable<FeatureDto> featureDtos = _mapper.Map<IEnumerable<FeatureDto>>(features).ToList();
            return ResponseResult.Success(featureDtos);
        }
    }
}
