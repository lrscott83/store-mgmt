using Domain.Common.Utils;
using FluentAssertions;
using Xunit;

namespace Application.Tests.DomainUtils
{
    public class StoreBillingUtilsTests
    {
        // ── Commission (mirrors GetCurrentPrice discount) ──────────────────────────
        [Fact]
        public void GetReSellerCommission_appliesPercentAndFlat()
        {
            // 2000 × 25% + 0 = 500
            StoreBillingUtils.GetReSellerCommission(2000f, 25f, 0f).Should().BeApproximately(500f, 0.001f);
        }

        [Fact]
        public void GetReSellerCommission_withFlat_addsFlat()
        {
            // 1000 × 20% + 50 = 250
            StoreBillingUtils.GetReSellerCommission(1000f, 20f, 50f).Should().BeApproximately(250f, 0.001f);
        }

        [Fact]
        public void GetReSellerCommission_noReseller_isZero()
        {
            StoreBillingUtils.GetReSellerCommission(1000f, 0f, 0f).Should().Be(0f);
        }

        // ── Next due date ──────────────────────────────────────────────────────────
        [Fact]
        public void GetNextDueDate_noPayments_isStartPlusTrialPlusOneMonth()
        {
            var start = new DateOnly(2026, 1, 10);
            // trial 1 + 1 post-paid month → first due ~2 months after activation
            StoreBillingUtils.GetNextDueDate(start, 1, null).Should().Be(new DateOnly(2026, 3, 10));
        }

        [Fact]
        public void GetNextDueDate_withLastPaid_usesLastPaidBeforeDate()
        {
            var start = new DateOnly(2026, 1, 10);
            var lastPaid = new DateOnly(2026, 5, 10);
            StoreBillingUtils.GetNextDueDate(start, 1, lastPaid).Should().Be(lastPaid);
        }

        // ── Status (dueSoon = 5, grace = 5) ────────────────────────────────────────
        [Theory]
        [InlineData("2026-03-04", StoreBillingStatusType.AlDia)]     // > 5 days before due
        [InlineData("2026-03-05", StoreBillingStatusType.PorVencer)] // exactly 5 days before
        [InlineData("2026-03-10", StoreBillingStatusType.PorVencer)] // due day
        [InlineData("2026-03-11", StoreBillingStatusType.EnGracia)]  // 1 day overdue
        [InlineData("2026-03-15", StoreBillingStatusType.EnGracia)]  // last grace day
        [InlineData("2026-03-16", StoreBillingStatusType.Vencido)]   // grace expired
        public void GetStatus_boundaries(string todayStr, StoreBillingStatusType expected)
        {
            var due = new DateOnly(2026, 3, 10);
            var today = DateOnly.Parse(todayStr);
            StoreBillingUtils.GetStatus(new DateOnly(2026, 1, 10), due, today, dueSoonDays: 5, graceDays: 5)
                .Should().Be(expected);
        }

        [Fact]
        public void GetStatus_noPlan_isNoAplica()
        {
            StoreBillingUtils.GetStatus(null, new DateOnly(2026, 3, 10), new DateOnly(2026, 3, 20), 5, 5)
                .Should().Be(StoreBillingStatusType.NoAplica);
        }

        // ── IsPaidPlanActive ───────────────────────────────────────────────────────
        [Fact]
        public void IsPaidPlanActive_withinGrace_true()
        {
            StoreBillingUtils.IsPaidPlanActive(new DateOnly(2026, 1, 10), new DateOnly(2026, 3, 10), new DateOnly(2026, 3, 15), 5)
                .Should().BeTrue();
        }

        [Fact]
        public void IsPaidPlanActive_pastGrace_false()
        {
            StoreBillingUtils.IsPaidPlanActive(new DateOnly(2026, 1, 10), new DateOnly(2026, 3, 10), new DateOnly(2026, 3, 16), 5)
                .Should().BeFalse();
        }

        [Fact]
        public void IsPaidPlanActive_noPlan_false()
        {
            StoreBillingUtils.IsPaidPlanActive(null, new DateOnly(2026, 3, 10), new DateOnly(2026, 3, 1), 5)
                .Should().BeFalse();
        }

        // ── IsInTrial ──────────────────────────────────────────────────────────────
        [Fact]
        public void IsInTrial_withinTrialMonth_true()
        {
            StoreBillingUtils.IsInTrial(new DateOnly(2026, 1, 10), 1, new DateOnly(2026, 2, 5)).Should().BeTrue();
        }

        [Fact]
        public void IsInTrial_afterTrial_false()
        {
            StoreBillingUtils.IsInTrial(new DateOnly(2026, 1, 10), 1, new DateOnly(2026, 2, 20)).Should().BeFalse();
        }
    }
}
