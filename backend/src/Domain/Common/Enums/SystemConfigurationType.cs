using System.ComponentModel;

namespace Domain.Common.Enums
{
    public enum SystemConfigurationType : int
    {
        [Description("TestingPeriodInMonths")]
        TestingPeriodInMonths = 1,

        [Description("ReSellerPercentDiscountPrice")]
        ReSellerPercentDiscountPrice = 2,

        [Description("PaymentGraceDays")]
        PaymentGraceDays = 3,

        [Description("DueSoonDays")]
        DueSoonDays = 4,

        [Description("OfflineRosterTtlDays")]
        OfflineRosterTtlDays = 5,
    }
}
