using System;
using System.Collections.Generic;
using System.Linq;
using Domain.Common.Utils;
using Domain.Entities.Modules;
using Domain.Entities.StoreModules;
using FluentAssertions;

namespace Domain.UnitTests.Common
{
    /// <summary>
    /// The single total-price rule: active + not-included modules contribute their effective
    /// price (<see cref="CurrentPriceServiceUtils.GetCurrentPrice"/>), everything else contributes 0.
    /// Both domain shapes (catalog <see cref="Module"/> and store snapshot <see cref="StoreModule"/>)
    /// must produce the same numbers.
    /// </summary>
    public class ModulePriceCalculatorTests
    {
        private static readonly Guid StoreId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        private static readonly Guid TenantId = Guid.Parse("22222222-2222-2222-2222-222222222222");

        private static Module CatalogModule(
            bool isActive, bool priceIncluded, float price, float percentDiscountPrice, float discountPrice)
            => Module.Create(
                id: 1,
                name: "Module",
                order: 1,
                priceIncluded: priceIncluded,
                price: price,
                discountPrice: discountPrice,
                percentDiscountPrice: percentDiscountPrice,
                availableToStore: true,
                isActive: isActive);

        private static StoreModule SnapshotModule(
            bool isActive, bool priceIncluded, float price, float percentDiscountPrice, float discountPrice)
        {
            var storeModule = StoreModule.Create(
                storeId: StoreId,
                moduleId: 1,
                price: price,
                modulePriceIncluded: priceIncluded,
                modulePrice: price,
                moduleDiscountPrice: discountPrice,
                modulePercentDiscountPrice: percentDiscountPrice,
                tenantId: TenantId);
            storeModule.IsActive = isActive;
            return storeModule;
        }

        // ── Single-module rule ──────────────────────────────────────────────────────
        [Theory]
        [InlineData(true, false)]   // active, not included → billable
        [InlineData(true, true)]    // active, included     → not billable
        [InlineData(false, false)]  // inactive, not included → not billable
        [InlineData(false, true)]   // inactive, included   → not billable
        public void IsBillable_requiresActiveAndNotIncluded(bool isActive, bool priceIncluded)
        {
            ModulePriceCalculator.IsBillable(isActive, priceIncluded)
                .Should().Be(isActive && !priceIncluded);
        }

        [Fact]
        public void GetEffectivePrice_billable_returnsGetCurrentPrice()
        {
            // 1000 - 1000*10/100 - 50 = 850
            ModulePriceCalculator.GetEffectivePrice(true, false, 1000f, 10f, 50f)
                .Should().BeApproximately(CurrentPriceServiceUtils.GetCurrentPrice(1000f, 10f, 50f), 0.0001f);
        }

        [Theory]
        [InlineData(true, true)]
        [InlineData(false, false)]
        [InlineData(false, true)]
        public void GetEffectivePrice_nonBillable_isZero(bool isActive, bool priceIncluded)
        {
            ModulePriceCalculator.GetEffectivePrice(isActive, priceIncluded, 1000f, 10f, 50f)
                .Should().Be(0f);
        }

        // ── Catalog Module overload ─────────────────────────────────────────────────
        [Fact]
        public void CalculateTotal_catalog_inactiveModule_contributesZero()
        {
            var modules = new[] { CatalogModule(isActive: false, priceIncluded: false, 500f, 0f, 0f) };

            ModulePriceCalculator.CalculateTotal(modules).Should().Be(0f);
        }

        [Fact]
        public void CalculateTotal_catalog_priceIncludedModule_contributesZero()
        {
            var modules = new[] { CatalogModule(isActive: true, priceIncluded: true, 500f, 0f, 0f) };

            ModulePriceCalculator.CalculateTotal(modules).Should().Be(0f);
        }

        [Fact]
        public void CalculateTotal_catalog_activeNotIncluded_appliesPercentDiscount()
        {
            // 1000 - 1000*25/100 = 750
            var modules = new[] { CatalogModule(isActive: true, priceIncluded: false, 1000f, 25f, 0f) };

            ModulePriceCalculator.CalculateTotal(modules).Should().BeApproximately(750f, 0.0001f);
        }

        [Fact]
        public void CalculateTotal_catalog_activeNotIncluded_appliesFlatDiscount()
        {
            // 1000 - 120 = 880
            var modules = new[] { CatalogModule(isActive: true, priceIncluded: false, 1000f, 0f, 120f) };

            ModulePriceCalculator.CalculateTotal(modules).Should().BeApproximately(880f, 0.0001f);
        }

        [Fact]
        public void CalculateTotal_catalog_activeNotIncluded_appliesPercentThenFlat()
        {
            // 1000 - 1000*10/100 - 50 = 850
            var modules = new[] { CatalogModule(isActive: true, priceIncluded: false, 1000f, 10f, 50f) };

            ModulePriceCalculator.CalculateTotal(modules).Should().BeApproximately(850f, 0.0001f);
        }

        [Fact]
        public void CalculateTotal_catalog_discountsExceedPrice_clampsAtZero()
        {
            // 100 - 100*50/100 - 80 = -30 -> clamped to 0
            var modules = new[] { CatalogModule(isActive: true, priceIncluded: false, 100f, 50f, 80f) };

            ModulePriceCalculator.CalculateTotal(modules).Should().Be(0f);
        }

        [Fact]
        public void CalculateTotal_catalog_empty_isZero()
        {
            ModulePriceCalculator.CalculateTotal(Array.Empty<Module>()).Should().Be(0f);
        }

        [Fact]
        public void CalculateTotal_catalog_null_isZero()
        {
            ModulePriceCalculator.CalculateTotal((IEnumerable<Module>?)null).Should().Be(0f);
        }

        [Fact]
        public void CalculateTotal_catalog_mixed_sumsOnlyQualifyingRows()
        {
            // qualifying: 750 (25% off 1000) + 880 (120 flat off 1000)
            // discarded: inactive 400, included 300
            var modules = new[]
            {
                CatalogModule(isActive: true,  priceIncluded: false, 1000f, 25f,   0f),
                CatalogModule(isActive: false, priceIncluded: false, 400f,  0f,    0f),
                CatalogModule(isActive: true,  priceIncluded: true,  300f,  0f,    0f),
                CatalogModule(isActive: true,  priceIncluded: false, 1000f, 0f,    120f),
            };

            ModulePriceCalculator.CalculateTotal(modules).Should().BeApproximately(1630f, 0.0001f);
        }

        // ── StoreModule snapshot overload ──────────────────────────────────────────
        [Fact]
        public void CalculateTotal_storeModule_inactiveModule_contributesZero()
        {
            var modules = new[] { SnapshotModule(isActive: false, priceIncluded: false, 500f, 0f, 0f) };

            ModulePriceCalculator.CalculateTotal(modules).Should().Be(0f);
        }

        [Fact]
        public void CalculateTotal_storeModule_priceIncludedModule_contributesZero()
        {
            var modules = new[] { SnapshotModule(isActive: true, priceIncluded: true, 500f, 0f, 0f) };

            ModulePriceCalculator.CalculateTotal(modules).Should().Be(0f);
        }

        [Fact]
        public void CalculateTotal_storeModule_activeNotIncluded_appliesPercentDiscount()
        {
            // 1000 - 1000*25/100 = 750
            var modules = new[] { SnapshotModule(isActive: true, priceIncluded: false, 1000f, 25f, 0f) };

            ModulePriceCalculator.CalculateTotal(modules).Should().BeApproximately(750f, 0.0001f);
        }

        [Fact]
        public void CalculateTotal_storeModule_activeNotIncluded_appliesFlatDiscount()
        {
            // 1000 - 120 = 880
            var modules = new[] { SnapshotModule(isActive: true, priceIncluded: false, 1000f, 0f, 120f) };

            ModulePriceCalculator.CalculateTotal(modules).Should().BeApproximately(880f, 0.0001f);
        }

        [Fact]
        public void CalculateTotal_storeModule_activeNotIncluded_appliesPercentThenFlat()
        {
            // 1000 - 1000*10/100 - 50 = 850
            var modules = new[] { SnapshotModule(isActive: true, priceIncluded: false, 1000f, 10f, 50f) };

            ModulePriceCalculator.CalculateTotal(modules).Should().BeApproximately(850f, 0.0001f);
        }

        [Fact]
        public void CalculateTotal_storeModule_discountsExceedPrice_clampsAtZero()
        {
            // 100 - 100*50/100 - 80 = -30 -> clamped to 0
            var modules = new[] { SnapshotModule(isActive: true, priceIncluded: false, 100f, 50f, 80f) };

            ModulePriceCalculator.CalculateTotal(modules).Should().Be(0f);
        }

        [Fact]
        public void CalculateTotal_storeModule_empty_isZero()
        {
            ModulePriceCalculator.CalculateTotal(Array.Empty<StoreModule>()).Should().Be(0f);
        }

        [Fact]
        public void CalculateTotal_storeModule_null_isZero()
        {
            ModulePriceCalculator.CalculateTotal((IEnumerable<StoreModule>?)null).Should().Be(0f);
        }

        [Fact]
        public void CalculateTotal_storeModule_mixed_sumsOnlyQualifyingRows()
        {
            // qualifying: 750 (25% off 1000) + 880 (120 flat off 1000)
            // discarded: inactive 400, included 300
            var modules = new[]
            {
                SnapshotModule(isActive: true,  priceIncluded: false, 1000f, 25f, 0f),
                SnapshotModule(isActive: false, priceIncluded: false, 400f,  0f,  0f),
                SnapshotModule(isActive: true,  priceIncluded: true,  300f,  0f,  0f),
                SnapshotModule(isActive: true,  priceIncluded: false, 1000f, 0f,  120f),
            };

            ModulePriceCalculator.CalculateTotal(modules).Should().BeApproximately(1630f, 0.0001f);
        }

        // ── Parity with the reference implementation ───────────────────────────────
        [Fact]
        public void CalculateTotal_storeModule_reproducesBillingServiceInlineComputation()
        {
            // BillingService.GetStoreBillingSummaryAsync (BillingService.cs:80-83):
            //   store.StoreModules.Where(sm => sm.IsActive && !sm.ModulePriceIncluded)
            //       .Sum(sm => CurrentPriceServiceUtils.GetCurrentPrice(
            //           sm.Price, sm.ModulePercentDiscountPrice, sm.ModuleDiscountPrice));
            var storeModules = new[]
            {
                SnapshotModule(isActive: true,  priceIncluded: false, 1499.99f, 15f, 0f),
                SnapshotModule(isActive: false, priceIncluded: false, 800f,    0f,  0f),
                SnapshotModule(isActive: true,  priceIncluded: true,  650f,    0f,  0f),
                SnapshotModule(isActive: true,  priceIncluded: false, 300f,    0f,  25.5f),
                SnapshotModule(isActive: true,  priceIncluded: false, 100f,    50f, 80f),   // clamps to 0
            };

            float reference = storeModules
                .Where(sm => sm.IsActive && !sm.ModulePriceIncluded)
                .Sum(sm => CurrentPriceServiceUtils.GetCurrentPrice(
                    sm.Price, sm.ModulePercentDiscountPrice, sm.ModuleDiscountPrice));

            ModulePriceCalculator.CalculateTotal(storeModules).Should().Be(reference);
        }

        [Fact]
        public void CalculateTotal_bothOverloads_agreeOnIdenticalValues()
        {
            (bool IsActive, bool PriceIncluded, float Price, float Percent, float Discount)[] rows =
            {
                (true,  false, 1000f, 25f,   0f),
                (false, false, 400f,  0f,    0f),
                (true,  true,  300f,  0f,    0f),
                (true,  false, 1000f, 0f,    120f),
                (true,  false, 100f,  50f,   80f),
                (true,  false, 33.33f, 33f, 0.01f),
            };

            var catalog = rows.Select(r => CatalogModule(r.IsActive, r.PriceIncluded, r.Price, r.Percent, r.Discount));
            var snapshot = rows.Select(r => SnapshotModule(r.IsActive, r.PriceIncluded, r.Price, r.Percent, r.Discount));

            ModulePriceCalculator.CalculateTotal(catalog)
                .Should().Be(ModulePriceCalculator.CalculateTotal(snapshot));
        }

        [Fact]
        public void CalculateTotal_noRounding_isApplied()
        {
            // 10f and 0.1f are not exactly representable: the result is float32 arithmetic,
            // NOT rounded to any decimal scale.
            var modules = new[] { SnapshotModule(isActive: true, priceIncluded: false, 10f, 0f, 0.1f) };

            var total = ModulePriceCalculator.CalculateTotal(modules);

            // Exactly the float32 expression, not a decimal-scaled one.
            total.Should().Be(CurrentPriceServiceUtils.GetCurrentPrice(10f, 0f, 0.1f));
            total.Should().Be(10f - 0.1f);
        }
    }
}