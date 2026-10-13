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
    /// <summary>
    /// Read-only plan catalog. <paramref name="IncludeInactiveModules"/> is a SuperAdmin-only
    /// opt-out of the active-only filter on <c>plan.modules</c>: the module catalog editor
    /// (<c>/admin/modules</c>) needs a plan's FULL membership so a deactivated module stays
    /// under its own plan instead of falling into the catch-all bucket. The default
    /// (active-only) is what the plan-change panels rely on and is never changed.
    /// </summary>
    public sealed record GetPlansQuery(bool IncludeInactiveModules = false) : IQuery<IEnumerable<PlanDto>>
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

            // The inactive-module universe is a SuperAdmin editing concern only: the module
            // catalog editor (/admin/modules) needs a plan's full membership to keep an
            // inactive module under its plan. Every other caller keeps the default
            // (active-only) shape, so the plan-change panels are untouched.
            if (query.IncludeInactiveModules && !_httpContextService.IsSuperAdmin)
                throw new ApiException(_localizer["Forbidden"], HttpStatusCode.Forbidden);

            IEnumerable<StorePlan> plans = await _planRepository.GetActivePlansIncludingModulesForCatalogAsync();

            // Plan 2026-09-21: VIP is SuperAdmin-reserved in the catalog. The repository
            // serves every active plan; non-SuperAdmin callers (owners changing their
            // store plan) keep seeing Gratis/Pago/Superior only.
            if (!_httpContextService.IsSuperAdmin)
                plans = plans.Where(p => p.Id != (int)StorePlanType.VIP);

            IEnumerable<PlanDto> planDtos = _mapper.Map<IEnumerable<PlanDto>>(plans).ToList();

            // Plan-module activation: a module switched off in the catalog must vanish from
            // every plan's panel (the owner's store-plan view AND the SuperAdmin one), so the
            // operator only ever sees ACTIVE modules. The plan's Price already excludes
            // inactive modules (ModulePriceCalculator), so only the visible list is filtered
            // here. The module catalog editor opts OUT of this filter through
            // `IncludeInactiveModules`: it must keep a deactivated module under its own plan,
            // and its totals count only active modules anyway.
            if (!query.IncludeInactiveModules)
            {
                foreach (var plan in planDtos)
                    plan.Modules = plan.Modules.Where(module => module.IsActive).ToList();
            }

            return ResponseResult.Success(planDtos);
        }
    }
}