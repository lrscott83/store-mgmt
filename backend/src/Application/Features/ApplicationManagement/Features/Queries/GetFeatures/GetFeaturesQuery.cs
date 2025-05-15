using Application.Abstractions.Messaging;
using Application.Dtos.Administration.Features;
using Application.ResponseModels;
using AutoMapper;
using Domain.Interfaces.Repositories;

namespace Application.Features.ApplicationManagement.Features.Queries.GetFeatures
{
    public sealed record GetFeaturesQuery(bool IncludeInactive) : IQuery<List<FeatureDto>> {    }

    public class GetFeaturesQueryHandler : IQueryHandler<GetFeaturesQuery, List<FeatureDto>>
    {
        private readonly IFeatureRepository _featureRepository;
        private readonly IMapper _mapper;
        public GetFeaturesQueryHandler(IFeatureRepository featureRepository, IMapper mapper)
        {
            _featureRepository = featureRepository;
            _mapper = mapper;
        }

        public async Task<ResponseResult<List<FeatureDto>>> Handle(GetFeaturesQuery query, CancellationToken cancellationToken)
        {
            var features = await _featureRepository.GetFeaturesIncludingModuleAsync(query.IncludeInactive);
            var featureDtos = _mapper.Map<List<FeatureDto>>(features.ToList());
            return await Task.FromResult(ResponseResult.Success(featureDtos));
        }
    }
}
