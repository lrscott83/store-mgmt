namespace Domain.Common.Entities
{

    public class AuditableEntity : Entity, IAuditableEntity
    {
        protected AuditableEntity() { }
        public bool IsActive { get; set; } = true;

        public DateTimeOffset CreatedDate { get; set; }

        public Guid CreatedBy { get; set; }

        public DateTimeOffset? UpdatedDate { get; set; }

        public Guid? UpdatedBy { get; set; }
    }

    public abstract class AuditableEntity<TId> : Entity<TId>, IAuditableEntity
    {
        protected AuditableEntity(TId id) : base(id) { }

        public bool IsActive { get; set; } = true;

        public DateTimeOffset CreatedDate { get; set; } = DateTimeOffset.UtcNow;

        public Guid CreatedBy { get; set; }

        public DateTimeOffset? UpdatedDate { get; set; }

        public Guid? UpdatedBy { get; set; }
    }
}
