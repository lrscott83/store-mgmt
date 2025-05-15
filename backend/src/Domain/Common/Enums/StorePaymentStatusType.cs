using System.ComponentModel;

namespace Domain.Common.Enums
{
    public enum StorePaymentStatusType : int
    {
        [Description("Created")]
        Created = 1,

        [Description("Notified")]
        Notified = 2,

        [Description("Invoiced")]
        Invoiced = 3,

        [Description("Approved")]
        Approved = 4,

        [Description("Paid")]
        Paid = 5,
    }
}
