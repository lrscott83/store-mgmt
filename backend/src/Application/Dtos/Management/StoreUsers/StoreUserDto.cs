namespace Application.Dtos.Management.StoreUsers
{
    public sealed class StoreUserDto
    {
        /// <summary>
        /// The store user's user id. <see cref="Domain.Entities.StoreUsers.StoreUser"/> has no
        /// surrogate key: the repository resolves a row by <c>UserId</c>, so this is the id the
        /// <c>GET /api/v1/StoreUsers/{id}</c> action accepts.
        /// </summary>
        public Guid Id { get; set; }
        public Guid StoreId { get; set; }
        /// <summary>
        /// The store's display name. Nullable because a read that does not materialize the
        /// <c>Store</c> navigation (StoreUserRepository.GetStoreUserByIdAsync) has no name to map.
        /// </summary>
        public string? StoreName { get; set; }
        public required string Login { get; set; }
        public required string FullName { get; set; }
        public string? CellPhone { get; set; }
        public string? Email { get; set; }
        public bool IsActive { get; set; }
    }
}
