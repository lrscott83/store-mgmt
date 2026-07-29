namespace Infrastructure.Migrations
{
    public static class PaymentStartDateBackfill
    {
        public const string Sql =
            "UPDATE \"Store\" SET \"PaymentStartDate\" = NULL WHERE \"PaymentStartDate\" = '-infinity'::date";
    }
}