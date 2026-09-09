using System.ComponentModel;

namespace Domain.Common.Enums
{
    public enum StorePlanType : int
    {
        [Description("Gratis")]
        Gratis = 1,

        [Description("Pago")]
        Pago = 2,

        [Description("Superior")]
        Superior = 3,

        [Description("VIP")]
        VIP = 4,
    }
}