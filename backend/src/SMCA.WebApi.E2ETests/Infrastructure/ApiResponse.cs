using System.Text.Json;

namespace SMCA.WebApi.E2ETests.Infrastructure;

public sealed class ApiResponse<T>
{
    public bool Succeeded { get; set; }
    public T? Data { get; set; }
    public List<ApiError> Errors { get; set; } = new();
    public int? ActionCode { get; set; }
    public string? Message { get; set; }
}

public sealed class ApiError
{
    public string Code { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

public static class ApiResponse
{
    public static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };
}
