using Domain.Common.Entities;
using Domain.Common.Events;
using Domain.Entities.Modules;
using Domain.Entities.StorePaymentStatuses;
using Domain.Entities.Stores;

namespace Domain.Entities.StorePayments
{
    public sealed class StorePayment : AuditableEntity<Guid>, ITenantBaseEntity
    {
        public Guid StoreId { get; set; }
        public Store Store { get; set; } = null!;
        public int StorePaymentStatusId { get; set; }
        public StorePaymentStatus StorePaymentStatus { get; set; } = null!;
        public DateTimeOffset? PaidDate { get; set; } = null;
        public DateTimeOffset? NotificationDate { get; set; } = null;
        public DateTimeOffset PaymentBeforeDate { get; set; }
        public float Price { get; set; }
        public int Year { get; set; }
        public int Month { get; set; }
        public Guid? ReSellerId { get; set; }
        public float ReSellerPercentDiscountPrice { get; set; }
        public float ReSellerDiscountPrice { get; set; }
        public float ReSellerAmount { get; set; }
        public bool ByReSeller { get; set; }
        public Guid TenantId { get; private set; }
        private StorePayment(Guid id, Guid storeId, int storePaymentStatusId, float price, DateTimeOffset paymentBeforeDate,
            int year, int month, Guid tenantId) : base(id)
        {
            StoreId = storeId;
            StorePaymentStatusId = storePaymentStatusId;
            Price = price;
            PaymentBeforeDate = paymentBeforeDate;
            Year = year;
            Month = month;
            TenantId = tenantId;
        }

        public static StorePayment Create(Guid storeId, int storePaymentStatusId, float price, DateTimeOffset paymentBeforeDate,
            int year, int month, Guid tenantId,
            Guid? reSellerId, float reSellerPercentDiscountPrice, float reSellerDiscountPrice, float reSellerAmount, bool byReSeller)
        {
            var storePayment = new StorePayment(Guid.NewGuid(), storeId, storePaymentStatusId, price, paymentBeforeDate,
                year, month, tenantId);
            storePayment.ReSellerId = reSellerId;
            storePayment.ReSellerPercentDiscountPrice = reSellerPercentDiscountPrice;
            storePayment.ReSellerDiscountPrice = reSellerDiscountPrice;
            storePayment.ReSellerAmount = reSellerAmount;
            storePayment.ByReSeller = byReSeller;
            storePayment.PaidDate = DateTimeOffset.UtcNow;
            storePayment.Raise(new StorePaymentCreatedEvent(storePayment.Id));
            return storePayment;
        }
       
    }

    public sealed record StorePaymentCreatedEvent(Guid StorePaymentId) : IDomainEvent { }
}
