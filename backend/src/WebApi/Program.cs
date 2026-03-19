using Application;
using FastEndpoints;
using Infrastructure;
using WebApi.Extensions;

var builder = WebApplication.CreateBuilder(args);

// ============================================================================
// GLOBAL EXCEPTION HANDLERS - MUST BE FIRST!
// These handlers ensure that NO exception can crash the container without being logged.
// ============================================================================
builder.Host.AddGlobalExceptionHandlers();

// ============================================================================
// SERVICES REGISTRATION
// ============================================================================
builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ============================================================================
// HOST BUILD
// ============================================================================
var app = builder.Build();

// ============================================================================
// HTTP PIPELINE
// ============================================================================
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseDeveloperExceptionPage();
}
else
{
    // FastEndpoints default exception handler - handles HTTP exceptions
    app.UseDefaultExceptionHandler();
    app.UseHsts();
}

app.UseHttpsRedirection();

// ============================================================================
// GRACEFUL SHUTDOWN & RUN
// ============================================================================
Console.WriteLine("=== Application starting ===");
Console.WriteLine($"Environment: {app.Environment.EnvironmentName}");
Console.WriteLine($"Started at: {DateTime.UtcNow:yyyy-MM-dd HH:mm:ss} UTC");

try
{
    await app.RunAsync();
}
catch (Exception ex)
{
    // This catch is for startup exceptions that happen AFTER Build() but BEFORE RunAsync()
    Console.Error.WriteLine("=== FATAL: Startup exception caught in Program.cs ===");
    Console.Error.WriteLine($"Exception: {ex.GetType().FullName}");
    Console.Error.WriteLine($"Message: {ex.Message}");
    Console.Error.WriteLine($"StackTrace: {ex.StackTrace}");

    // In containerized environments, you might want to:
    // 1. Exit with non-zero code to trigger restart policy
    // 2. Or exit with zero if you want to prevent restart loops
    //
    // For production, we exit with 1 to let the orchestrator decide
    Environment.Exit(1);
}
finally
{
    Console.WriteLine("=== Application shutdown complete ===");
}
