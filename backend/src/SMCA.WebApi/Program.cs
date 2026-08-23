using Application.Abstractions.HttpContext;
using Application.Services.Tenants;
using Application.Abstractions.Time;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using SMCA.WebApi.PolicyCode;
using SMCA.WebApi.Services;
using Application;
using Infrastructure;
using Application.Abstractions.Authentication;
using Application.Services.Authentication;
using Infrastructure.Persistence.Contexts;
using SMCA.WebApi.Authentication;
using Microsoft.AspNetCore.Http.Features;
using SMCA.WebApi.Extensions;
using SMCA.WebApi.Middlewares;
using Serilog;
using System.Configuration;
using Serilog.Sinks.Elasticsearch;
using System.Reflection;
using System;
using SMCA.WebApi.OptionsSetup;

var builder = WebApplication.CreateBuilder(args);

// E2E override: load appsettings.E2E.json unconditionally when present.
// This file points ConnectionStrings:Application to smca_test and is the
// single source of truth for the E2E database — no env-var juggling needed.
builder.Configuration.AddJsonFile("appsettings.E2E.json", optional: true, reloadOnChange: false);

var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
var elasticUri = builder.Configuration.GetValue<string>("ElasticConfiguration:Uri");
string indexPrefix = $"{Assembly.GetExecutingAssembly().GetName().Name!.ToLower().Replace(".", "-")}";
var logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Elasticsearch(new ElasticsearchSinkOptions(new Uri(elasticUri))
    {
        AutoRegisterTemplate = true,
        AutoRegisterTemplateVersion = AutoRegisterTemplateVersion.ESv6,
        IndexFormat = $"{Assembly.GetExecutingAssembly().GetName().Name!.ToLower().Replace(".", "-")}-{environment?.ToLower().Replace(".", "-")}-{DateTime.UtcNow:yyyy-MM}"
    })
    .CreateLogger();
builder.Host.UseSerilog(logger);

// Add services to the container.

builder.Services.AddHttpContextAccessor();
builder.Services.AddMemoryCache();
builder.Services.AddScoped<TenantIdProvider>();
builder.Services.AddScoped<IHttpContextService, HttpContextService>();
builder.Services.AddSingleton<ITokenBlacklistService, TokenBlacklistService>();
builder.Services.AddSingleton<IDateTimeProvider, DateTimeProvider>();

//Register the Permission policy handlers
builder.Services.AddSingleton<IAuthorizationPolicyProvider, AuthorizationPolicyProvider>();
builder.Services.AddSingleton<IAuthorizationHandler, FeatureTypeHandler>();
builder.Services.AddScoped<IClaimsTransformation, ClaimsTransformerService>();

builder.Services
    .AddApplication(builder.Configuration)
    .AddInfrastructure(builder.Configuration);

builder.Services.AddScoped<IAuthTokenConfig, JwtAuthTokenConfig>();
builder.Services.AddScoped<IOfflineVerifierService, OfflineVerifierService>();
builder.Services.AddScoped<IStoreKeyWrapService, StoreKeyWrapService>();
builder.Services.AddScoped<IStoreDataKeyProvider>(_ =>
    new StoreDataKeyProvider(builder.Configuration.GetValue<string>("StoreEncryption:MasterSecret")!));
builder.Services.AddScoped<IOfflinePreHashProtector>(_ =>
    new OfflinePreHashProtector(builder.Configuration.GetValue<string>("StoreEncryption:MasterSecret")!));

builder.Services.Configure<TenantConnectionSettings>(options =>
    builder.Configuration.GetSection(nameof(TenantConnectionSettings)).Bind(options));

string? connectionString = builder.Configuration.GetConnectionString("Application");

// E2E guard: verify the connection string points to the test database.
// Prevents accidental writes to production when running E2E tests.
if (connectionString != null && connectionString.Contains("Database=", StringComparison.OrdinalIgnoreCase))
{
    var dbMatch = System.Text.RegularExpressions.Regex.Match(connectionString, @"Database=([^;]+)");
    if (dbMatch.Success)
    {
        var dbName = dbMatch.Groups[1].Value;
        Console.WriteLine($"[E2E Guard] ConnectionStrings:Application -> Database={dbName}");
        if (builder.Environment.IsEnvironment("Testing") || Environment.GetEnvironmentVariable("E2E_DB_GUARD") == "1")
        {
            if (!dbName.Equals("smca_test", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    $"[E2E Guard] Expected database 'smca_test' but got '{dbName}'. " +
                    $"Ensure appsettings.E2E.json is loaded or ConnectionStrings__Application env var is set.");
            }
        }
    }
}

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(connectionString,
    b => b.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName)));

builder.Services.AddScoped<IJwtProvider, JwtProvider>();

builder.Services.AddJwtAuthenticationExtension(builder);

builder.Services.AddLocalizationExtension();

builder.Services.AddCors(options => options.AddDefaultPolicy(builder =>
{
    builder
    .AllowAnyMethod()
    .AllowAnyHeader()
    .AllowCredentials()
    .WithOrigins("http://localhost:4200", "https://localhost:4200",
    "http://192.168.1.103", "https://192.168.1.103", 
    "http://localhost:8083", "http://localhost:8082", 
    "https://mgmtapi.playground.sceiba.net",
    "https://vdt.playground.sceiba.net");
}));

builder.Services.Configure<FormOptions>(o =>
{
    o.ValueLengthLimit = int.MaxValue;
    o.MultipartBodyLengthLimit = int.MaxValue;
    o.MemoryBufferThreshold = int.MaxValue;
});


builder.Services.AddRouting(options => options.LowercaseUrls = true);

builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddApiVersioningExtension();
builder.Services.AddHealthChecks();

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddPolicy("LoginPolicy", RateLimitPolicies.Login);
    options.AddPolicy("RegisterPolicy", RateLimitPolicies.Register);
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.ApplyMigrations();
}

app.UseCors(x => 
x.AllowAnyHeader()
.AllowAnyMethod()
.AllowCredentials()
.WithOrigins("http://localhost:4200", "https://localhost:4200", "http://localhost:3333", "https://localhost:3333")
);

app.UseHttpsRedirection();

app.UseStaticFiles();

//Add support to logging request with SERILOG
app.UseSerilogRequestLogging();

app.UseRouting();


//app.UseStatusCodePages();
//app.UseStaticFiles();   

app.UseAuthentication();

app.UseAuthorization();

app.UseRateLimiter();

app.UseMiddleware<ErrorHandlerMiddleware>();
app.UseHealthChecks("/health");

//app.MapControllers();

app.UseEndpoints(endpoints =>
{
    endpoints.MapControllers();
    //.RequireAuthorization()
    //.RequireCors("AllowSpecificOrigin");
});

app.Run();

public partial class Program { }
