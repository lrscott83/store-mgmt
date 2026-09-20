using Domain.Common.Entities;
using Domain.Common.Enums;
using Domain.Entities.Stores;

namespace Domain.Entities.ChannelExchangeRates
{
    /// <summary>
    /// MultiPayments backend mirror (2026-09-18): append-only per-store rate register.
    /// Each row is a new rate for a channel (Method + Currency); existing rows are never
    /// edited or deleted. Value is expressed as moneda-por-USD (units of Currency per
    /// 1 USD) and EffectiveFrom defines the moment from which the rate applies.
    /// Persistence parity only — no endpoints.
    /// </summary>
    public sealed class ChannelExchangeRate : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;
        public SalePaymentMethod Method { get; set; }
        public Currency Currency { get; set; }
        /// <summary>Rate value: units of Currency per 1 USD (moneda-por-USD).</summary>
        public decimal Value { get; set; }
        /// <summary>Moment from which this rate applies.</summary>
        public DateTime EffectiveFrom { get; set; }
        public Guid TenantId { get; private set; }

        private ChannelExchangeRate(
            Guid id,
            Guid storeId,
            SalePaymentMethod method,
            Currency currency,
            decimal value,
            DateTime effectiveFrom,
            Guid tenantId) : base(id)
        {
            StoreId = storeId;
            Method = method;
            Currency = currency;
            Value = value;
            EffectiveFrom = effectiveFrom;
            TenantId = tenantId;
        }

        public static ChannelExchangeRate Create(
            Guid id,
            Guid storeId,
            SalePaymentMethod method,
            Currency currency,
            decimal value,
            DateTime effectiveFrom,
            Guid tenantId)
        {
            return new ChannelExchangeRate(id, storeId, method, currency, value, effectiveFrom, tenantId);
        }

        public static ChannelExchangeRate Create(
            Guid storeId,
            SalePaymentMethod method,
            Currency currency,
            decimal value,
            DateTime effectiveFrom,
            Guid tenantId)
        {
            return Create(Guid.NewGuid(), storeId, method, currency, value, effectiveFrom, tenantId);
        }
    }
}
