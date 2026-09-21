using Application.Abstractions.HttpContext;
using Application.Abstractions.Messaging;
using Application.Dtos.Administration.Plans;
using Application.Exceptions;
using Application.ResponseModels;
using AutoMapper;
using Domain.Common.Enums;
using Domain.Entities.Plans;
using Domain.Interfaces.Repositories;
using Microsoft.Extensions.Localization;
using Resources;
using System.Net;

namespace Application.Features.Administration.Plans.Queries.GetPlans
{
    public sealed record GetPlansQuery : IQuery<IEnumerable<PlanDto>>
    { }

    public class GetPlansQueryHandler : IQueryHandler<GetPlansQuery, IEnumerable<PlanDto>>
    {
        private readonly IHttpContextService _httpContextService;
        private readonly IPlanRepository _planRepository;
        private readonly IMapper _mapper;
        private readonly IStringLocalizer<I18n> _localizer;

        public GetPlansQueryHandler(IHttpContextService httpContextService, IPlanRepository planRepository,
            IMapper mapper, IStringLocalizer<I18n> localizer)
        {
            _httpContextService = httpContextService;
            _planRepository = planRepository;
            _mapper = mapper;
            _localizer = localizer;
        }

        public async Task<ResponseResult<IEnumerable<PlanDto>>> Handle(GetPlansQuery query, CancellationToken cancellationToken)
        {
            if (!_httpContextService.IsSuperAdminOrOwnerAdmin)
                throw new ApiException(_localizer["UserNotFound"], HttpStatusCode.BadRequest);

            IEnumerable<StorePlan> plans = await _planRepository.GetActivePlansIncludingModulesForCatalogAsync();

            // Plan 2026-09-21: VIP is SuperAdmin-reserved in the catalog. The repository
            // serves every active plan; non-SuperAdmin callers (owners changing their
            // store plan) keep seeing Gratis/Pago/Superior only.
            if (!_httpContextService.IsSuperAdmin)
                plans = plans.Where(p => p.Id != (int)StorePlanType.VIP);

            IEnumerable<PlanDto> planDtos = _mapper.Map<IEnumerable<PlanDto>>(plans).ToList();
            return ResponseResult.Success(planDtos);
        }
    }
}