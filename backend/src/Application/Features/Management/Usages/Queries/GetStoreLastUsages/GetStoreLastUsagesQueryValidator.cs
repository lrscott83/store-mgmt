using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;
using System.Globalization;

namespace Application.Features.Management.Usages.Queries.GetStoreLastWeekUsages
{
    /// <summary>
    /// Single source of truth for the client-supplied calendar day. The dashboard sends its
    /// own local "today"; the handler anchors the dense-bucket window there instead of on
    /// UtcNow, so a viewer behind UTC is not shown a day that has not happened yet for them.
    /// </summary>
    internal static class ClientDay
    {
        public const string IsoDateFormat = "yyyy-MM-dd";

        public static bool TryParse(string? value, out DateOnly day) =>
            DateOnly.TryParseExact(value, IsoDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None, out day);

        /// <summary>
        /// Strict parse for the handler. GetStoreLastUsagesQueryValidator has already rejected
        /// a missing/malformed value, so a throw here means the query bypassed the validation
        /// pipeline — loud on purpose rather than silently defaulting to a wrong window.
        /// </summary>
        public static DateOnly Parse(string? value) =>
            DateOnly.ParseExact(value, IsoDateFormat, CultureInfo.InvariantCulture, DateTimeStyles.None);
    }

    /// <summary>
    /// "today" is REQUIRED and must be an ISO calendar day. Both failures surface through the
    /// same pipeline — and therefore the same ApiResponse envelope with Errors[].Code ==
    /// "Today" — as every other validation failure in the API, rather than ASP.NET's shape for
    /// a failed type bind.
    /// </summary>
    public class GetStoreLastUsagesQueryValidator : AbstractValidator<GetStoreLastUsagesQuery>
    {
        private readonly IStringLocalizer<I18n> _localizer;

        public GetStoreLastUsagesQueryValidator(IStringLocalizer<I18n> localizer)
        {
            _localizer = localizer;

            RuleFor(x => x.Today)
                .NotEmpty().WithMessage(_localizer["IsRequired", "{PropertyName}"])
                .Must(value => ClientDay.TryParse(value, out _)).WithMessage(_localizer["IsRequired", "{PropertyName}"]);
        }
    }
}
