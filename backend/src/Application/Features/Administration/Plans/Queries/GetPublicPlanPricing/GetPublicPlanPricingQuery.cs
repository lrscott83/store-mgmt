using Application.Abstractions.Messaging;
using Application.Dtos.Administration.Plans;
using Application.ResponseModels;
using Domain.Common.Enums;
using Domain.Common.Extensions;
using Domain.Common.Utils;
using Domain.Entities.Modules;
using Domain.Entities.Plans;
using Domain.Interfaces.Repositories;

namespace Application.Features.Administration.Plans.Queries.GetPublicPlanPricing
{
    /// <summary>
    /// Public (anonymous) plan pricing for the marketing landing — owner request 2026-10-15.
    ///
    /// Returns Gratis, Pago and Superior (VIP is SuperAdmin-reserved, never public), each with its
    /// CUMULATIVE list of modules and their real prices.
    ///
    /// The module universe is the canonical "available to stores" set
    /// (<see cref="IModuleRepository.GetAvailableModulesToStore"/>): a module that is switched off
    /// in the global catalog, not available to stores, or without an active available feature is
    /// NOT offered — so it must not be advertised. The price of each module, and the plan total,
    /// go through the ONE price rule (<see cref="ModulePriceCalculator"/>).
    /// </summary>
    public sealed record GetPublicPlanPricingQuery : IQuery<IEnumerable<PublicPlanPricingDto>>;

    internal sealed class GetPublicPlanPricingQueryHandler
        : IQueryHandler<GetPublicPlanPricingQuery, IEnumerable<PublicPlanPricingDto>>
    {
        /// <summary>The plans the public landing may advertise, in catalog order.</summary>
        private static readonly StorePlanType[] PublicPlans =
        [
            StorePlanType.Gratis,
            StorePlanType.Pago,
            StorePlanType.Superior
        ];

        private readonly IPlanRepository _planRepository;
        private readonly IModuleRepository _moduleRepository;

        public GetPublicPlanPricingQueryHandler(
            IPlanRepository planRepository,
            IModuleRepository moduleRepository)
        {
            _planRepository = planRepository;
            _moduleRepository = moduleRepository;
        }

        public async Task<ResponseResult<IEnumerable<PublicPlanPricingDto>>> Handle(
            GetPublicPlanPricingQuery query, CancellationToken cancellationToken)
        {
            IEnumerable<StorePlan> plans = await _planRepository.GetActivePlansIncludingModulesForCatalogAsync();
            var availableToStore = (await _moduleRepository.GetAvailableModulesToStore())
                .ToDictionary(module => module.Id);

            var result = new List<PublicPlanPricingDto>();
            foreach (var planType in PublicPlans)
            {
                StorePlan? plan = plans.FirstOrDefault(p => p.Id == (int)planType);
                if (plan is null)
                    continue;

                // CUMULATIVE: every module the plan carries (it already includes the previous
                // plan's), restricted to the available-to-store universe and in catalog order.
                List<Module> modules = plan.StorePlanModules
                    .Select(spm => spm.Module)
                    .Where(module => module is not null && availableToStore.ContainsKey(module.Id))
                    .OrderBy(module => module.Order)
                    .ToList();

                result.Add(new PublicPlanPricingDto
                {
                    PlanType = planType.GetDescription(),
                    Name = plan.Name,
                    Order = plan.Order,
                    BasePrice = ModulePriceCalculator.CalculateBaseTotal(modules),
                    CurrentPrice = ModulePriceCalculator.CalculateTotal(modules),
                    Modules = modules.Select(module =>
                    {
                        // A price-included (bundled) module is shown at 0: it does not add cost.
                        bool billable = ModulePriceCalculator.IsBillable(module.IsActive, module.PriceIncluded);
                        return new PublicPlanModulePricingDto
                        {
                            ModuleId = module.Id,
                            Name = module.Name,
                            BasePrice = billable ? module.Price : 0f,
                            CurrentPrice = ModulePriceCalculator.GetEffectivePrice(
                                module.IsActive,
                                module.PriceIncluded,
                                module.Price,
                                module.PercentDiscountPrice,
                                module.DiscountPrice)
                        };
                    }).ToList()
                });
            }

            return ResponseResult.Success((IEnumerable<PublicPlanPricingDto>)result);
        }
    }
}
