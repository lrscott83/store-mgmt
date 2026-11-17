using Domain.Common.Enums;
using Domain.Entities.StorePayments;
using Domain.Interfaces.Repositories;
using Infrastructure.Persistence.Contexts;
using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;

namespace Infrastructure.Persistence.Repositories
{
    public class StorePaymentRepository : GenericRepository<StorePayment>, IStorePaymentRepository
    {
        private readonly DbSet<StorePayment> _storePayments;
        public StorePaymentRepository(ApplicationDbContext dbContext) : base(dbContext)
        {
            _storePayments = dbContext.Set<StorePayment>();
        }

        public async Task<StorePayment?> GetLastByStoreIdAsync(Guid storeId)
            => await _storePayments
                .Where(sp => sp.StoreId == storeId)
                .OrderByDescending(sp => sp.PaymentBeforeDate)
                .FirstOrDefaultAsync();

        public async Task<IEnumerable<StorePayment>> GetByStoreIdAsync(Guid storeId)
            => await _storePayments
                .Where(sp => sp.StoreId == storeId)
                .OrderByDescending(sp => sp.Year).ThenByDescending(sp => sp.Month)
                .ToListAsync();

        public async Task<int> GetPaidMonthsCountAsync(Guid storeId)
            => await _storePayments
                .CountAsync(sp => sp.StoreId == storeId
                    && sp.StorePaymentStatusId == (int)Domain.Common.Enums.StorePaymentStatusType.Paid);

        public async Task<bool> AnyByStoreIdsAsync(IEnumerable<Guid> storeIds, CancellationToken cancellationToken = default)
        {
            var ids = storeIds as IList<Guid> ?? storeIds.ToList();
            if (ids.Count == 0) return false;
            return await _storePayments
                .Where(sp => ids.Contains(sp.StoreId))
                .AnyAsync(cancellationToken);
        }

        public async Task<IEnumerable<StorePayment>> GetAllPaidWithReSellerAsync()
            => await _storePayments
                .Where(p => p.StorePaymentStatusId == (int)Domain.Common.Enums.StorePaymentStatusType.Paid
                    && p.ReSellerId != null)
                .ToListAsync();

        public async Task<IEnumerable<StorePayment>> GetPaidWithReSellerByReSellerUserAsync(Guid reSellerUserId)
            => await _storePayments
                .Include(p => p.Store)
                    .ThenInclude(s => s.Owner)
                    .ThenInclude(o => o.ReSellerOwner)
                    .ThenInclude(rso => rso.ReSeller)
                .Where(p => p.StorePaymentStatusId == (int)Domain.Common.Enums.StorePaymentStatusType.Paid
                    && p.ReSellerId != null
                    && p.Store.Owner.ReSellerOwner != null
                    && p.Store.Owner.ReSellerOwner.ReSeller.UserId == reSellerUserId)
                .IgnoreQueryFilters()
                .ToListAsync();

        public async Task<StorePaymentHistoryPage> GetHistoryPageAsync(
            StorePaymentHistoryFilter filter, CancellationToken cancellationToken = default)
        {
            // S3: only a "cobro realizado" is a PAID payment.
            var query = _storePayments
                .AsNoTracking()
                .Where(sp => sp.StorePaymentStatusId == (int)StorePaymentStatusType.Paid);

            // S2: the ReSeller scope is enforced HERE, in the query, with the same predicate the
            // commissions query uses. IgnoreQueryFilters is deliberate and mirrors
            // GetPaidWithReSellerByReSellerUserAsync: the explicit owner predicate is what scopes the
            // result, not the ambient tenant filter.
            if (filter.ReSellerUserId is { } reSellerUserId)
            {
                query = query
                    .IgnoreQueryFilters()
                    .Where(sp => sp.Store.Owner.ReSellerOwner != null
                        && sp.Store.Owner.ReSellerOwner.ReSeller.UserId == reSellerUserId);
            }

            // S5: from/to are inclusive DateOnly bounds over PaidDate. PaidDate is stored as a UTC
            // instant, so the upper bound is compared against the start of the NEXT day (exclusive).
            if (filter.From is { } from)
            {
                var fromUtc = new DateTimeOffset(from.ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
                query = query.Where(sp => sp.PaidDate >= fromUtc);
            }

            if (filter.To is { } to)
            {
                var toExclusiveUtc = new DateTimeOffset(to.AddDays(1).ToDateTime(TimeOnly.MinValue), TimeSpan.Zero);
                query = query.Where(sp => sp.PaidDate < toExclusiveUtc);
            }

            if (filter.StoreId is { } storeId)
                query = query.Where(sp => sp.StoreId == storeId);

            // S4/S10: the tab IS the currency. AmountPaid null = USD, a value = CUP. A tab never
            // holds rows of the other currency, so its totals are single-currency by construction.
            var currencyQuery = filter.Currency == StorePaymentCurrency.Cup
                ? query.Where(sp => sp.AmountPaid != null)
                : query.Where(sp => sp.AmountPaid == null);

            // S6: both tab counts, under the from/to/storeId/role filters, independent of the
            // selected currency and of the page (COUNT in the database, no rows loaded).
            var usdCount = await query.CountAsync(sp => sp.AmountPaid == null, cancellationToken);
            var cupCount = await query.CountAsync(sp => sp.AmountPaid != null, cancellationToken);
            var total = filter.Currency == StorePaymentCurrency.Cup ? cupCount : usdCount;

            // S9: the totals aggregate the WHOLE filter (SUM in the database), never the page.
            //
            // Money typing: AmountPaid is already decimal, so the CUP total is a native numeric SUM.
            // Price and ReSellerAmount are float columns: PostgreSQL sums them in the column's own
            // type and the single result is converted to decimal once, rounded to 2 decimals — the
            // granularity of the money this screen shows. Converting per row would only carry the
            // float binary noise (25.000000596…) into every figure.
            decimal totalAmount;
            if (filter.Currency == StorePaymentCurrency.Cup)
            {
                totalAmount = (await currencyQuery.SumAsync(sp => sp.AmountPaid, cancellationToken)) ?? 0m;
            }
            else
            {
                var usdTotal = await currencyQuery.SumAsync(sp => sp.Price, cancellationToken);
                totalAmount = ToMoney(usdTotal);
            }

            var commissionTotal = await currencyQuery.SumAsync(sp => sp.ReSellerAmount, cancellationToken);

            // S5: the ONLY clamp of page/pageSize. The effective values travel back on the page so
            // the handler echoes them instead of re-deriving its own.
            var page = filter.Page < 1 ? 1 : filter.Page;
            var pageSize = filter.PageSize < 1 ? 1 : filter.PageSize;

            // S11: newest first, with stable tie-breaks. PostgreSQL orders DESC as NULLS FIRST, which
            // would put a payment with no PaidDate at the very top of a money screen, so the leading
            // boolean key (`PaidDate is null`, false first) sorts the undated ones LAST explicitly.
            var rows = await currencyQuery
                .OrderBy(sp => sp.PaidDate == null)
                .ThenByDescending(sp => sp.PaidDate)
                .ThenByDescending(sp => sp.PaymentBeforeDate)
                .ThenBy(sp => sp.Id)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(ToRowProjection())
                .ToListAsync(cancellationToken);

            var items = rows
                .Select(r => new StorePaymentHistoryRow(
                    StoreId: r.StoreId,
                    StoreName: r.StoreName ?? string.Empty,
                    OwnerName: r.OwnerName ?? string.Empty,
                    PaidDate: r.PaidDate,
                    PaymentBeforeDate: r.PaymentBeforeDate,
                    // The amount is chosen HERE, once, per currency — and it is never a fabricated
                    // fallback. On the CUP tab the currency filter guarantees AmountPaid has a value,
                    // so a null would mean the invariant is broken and it surfaces as an exception
                    // instead of a plausible 0.00 on a money screen.
                    Amount: filter.Currency == StorePaymentCurrency.Cup
                        ? r.AmountPaid.Value
                        : ToMoney(r.Price),
                    Commission: ToMoney(r.ReSellerAmount),
                    ExchangeRate: r.ExchangeRate,
                    Price: ToMoney(r.Price)))
                .ToList();

            return new StorePaymentHistoryPage(
                Items: items,
                Total: total,
                TotalAmount: ToMoney(totalAmount),
                TotalCommission: ToMoney(commissionTotal),
                UsdCount: usdCount,
                CupCount: cupCount,
                Page: page,
                PageSize: pageSize);
        }

        /// <summary>
        /// Keeps the projection in one place so the shape stays a single SQL SELECT (no lazy loads,
        /// no N+1): the names come from Store → Owner → User.
        /// </summary>
        private static Expression<Func<StorePayment, StorePaymentHistoryRowProjection>> ToRowProjection()
            => sp => new StorePaymentHistoryRowProjection
            {
                StoreId = sp.StoreId,
                StoreName = sp.Store.Name,
                OwnerName = sp.Store.Owner.User.FullName,
                PaidDate = sp.PaidDate,
                PaymentBeforeDate = sp.PaymentBeforeDate,
                Price = sp.Price,
                AmountPaid = sp.AmountPaid,
                ReSellerAmount = sp.ReSellerAmount,
                ExchangeRate = sp.ExchangeRate,
            };

        /// <summary>
        /// float → decimal is a deliberate, one-way conversion at money granularity: the float source
        /// carries binary approximation noise (25.000000596…) that no screen or total should show.
        /// 2 decimals is the granularity of every amount in this feature.
        /// </summary>
        private static decimal ToMoney(decimal value) => Math.Round(value, 2, MidpointRounding.AwayFromZero);

        private static decimal ToMoney(float value) => Math.Round((decimal)value, 2, MidpointRounding.AwayFromZero);

        private sealed class StorePaymentHistoryRowProjection
        {
            public Guid StoreId { get; init; }
            public string? StoreName { get; init; }
            public string? OwnerName { get; init; }
            public DateTimeOffset? PaidDate { get; init; }
            public DateTimeOffset PaymentBeforeDate { get; init; }
            public float Price { get; init; }
            public decimal? AmountPaid { get; init; }
            public float ReSellerAmount { get; init; }
            public decimal? ExchangeRate { get; init; }
        }
    }
}
