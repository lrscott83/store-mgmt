using Domain.Common.Entities;
using Domain.Common.Enums;
using Domain.Entities.Orders;

namespace Domain.Entities.OrderPayments
{
    /// <summary>
    /// MultiPayments backend mirror (2026-09-18): one row per payment, 0..N per Order.
    /// A payment channel is the (Method, Currency) pair. The Rate* fields freeze the
    /// resolved rate at order-creation time: RateMethod/RateCurrency name the channel the
    /// rate came from, and RateEffectiveFrom is null for the synthetic USD pivot.
    /// Amount is expressed in the payment's currency; AmountInOrderCurrency holds the
    /// frozen conversion into the order currency. Persistence parity only — no endpoints.
    /// </summary>
    public sealed class OrderPayment : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid OrderId { get; set; }
        public Order Order { get; set; } = null!;
        public SalePaymentMethod Method { get; set; }
        public Currency Currency { get; set; }
        /// <summary>Payment amount in the payment's currency (channel = Method + Currency).</summary>
        public decimal Amount { get; set; }
        /// <summary>Frozen rate applied to this payment (moneda-por-USD).</summary>
        public decimal RateApplied { get; set; }
        /// <summary>Channel the frozen rate came from (null when unknown).</summary>
        public SalePaymentMethod? RateMethod { get; set; }
        /// <summary>Currency of the channel the frozen rate came from (null when unknown).</summary>
        public Currency? RateCurrency { get; set; }
        /// <summary>Effective-from date of the frozen rate; null for the synthetic USD pivot.</summary>
        public DateTime? RateEffectiveFrom { get; set; }
        /// <summary>Frozen conversion of Amount into the order currency.</summary>
        public decimal AmountInOrderCurrency { get; set; }
        public Guid TenantId { get; set; }

        private OrderPayment(
            Guid id,
            Guid orderId,
            SalePaymentMethod method,
            Currency currency,
            decimal amount,
            decimal rateApplied,
            SalePaymentMethod? rateMethod,
            Currency? rateCurrency,
            DateTime? rateEffectiveFrom,
            decimal amountInOrderCurrency,
            Guid tenantId) : base(id)
        {
            OrderId = orderId;
            Method = method;
            Currency = currency;
            Amount = amount;
            RateApplied = rateApplied;
            RateMethod = rateMethod;
            RateCurrency = rateCurrency;
            RateEffectiveFrom = rateEffectiveFrom;
            AmountInOrderCurrency = amountInOrderCurrency;
            TenantId = tenantId;
        }

        public static OrderPayment Create(
            Guid id,
            Guid orderId,
            SalePaymentMethod method,
            Currency currency,
            decimal amount,
            decimal rateApplied,
            SalePaymentMethod? rateMethod,
            Currency? rateCurrency,
            DateTime? rateEffectiveFrom,
            decimal amountInOrderCurrency,
            Guid tenantId)
        {
            return new OrderPayment(id, orderId, method, currency, amount, rateApplied, rateMethod,
                rateCurrency, rateEffectiveFrom, amountInOrderCurrency, tenantId);
        }

        public static OrderPayment Create(
            Guid orderId,
            SalePaymentMethod method,
            Currency currency,
            decimal amount,
            decimal rateApplied,
            SalePaymentMethod? rateMethod,
            Currency? rateCurrency,
            DateTime? rateEffectiveFrom,
            decimal amountInOrderCurrency,
            Guid tenantId)
        {
            return Create(Guid.NewGuid(), orderId, method, currency, amount, rateApplied,
                rateMethod, rateCurrency, rateEffectiveFrom, amountInOrderCurrency, tenantId);
        }
    }
}
