namespace Domain.Common.Entities
{
    public interface IAuditableEntity : IEntity
    {
        public bool IsActive { get; set; }

        public DateTimeOffset CreatedDate { get; set; }

        public Guid CreatedBy { get; set; }

        public DateTimeOffset? UpdatedDate { get; set; }

        public Guid? UpdatedBy { get; set; }
    }
}
