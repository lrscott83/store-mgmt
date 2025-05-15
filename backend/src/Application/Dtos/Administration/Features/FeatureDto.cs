namespace Application.Dtos.Administration.Features
{
    public sealed class FeatureDto
    {
        public int Id { get; set; }
        public int ModuleId { get; set; }
        public string Name { get; set; }
        public string DisplayName { get; set; }
        public string Description { get; set; }
        public int Order { get; set; }
        public bool IsIncluded { get; set; }
        public float Price { get; set; }
    }
}
