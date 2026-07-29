using Application;
using Application.Abstractions.Authentication;
using Application.Abstractions.HttpContext;
using Application.Services.Tenant;
using Infrastructure;
using Application.Abstractions.Time;
using Infrastructure.Persistence.Contexts;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using WebApiTest.Authentication;
using WebApiTest.Extensions;
using WebApiTest.Middlewares;
using WebApiTest.PolicyCode;
using WebApiTest.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<TenantIdProvider>();
builder.Services.AddScoped<IHttpContextService, HttpContextService>();
builder.Services.AddSingleton<IDateTimeProvider, DateTimeProvider>();

//Register the Permission policy handlers
builder.Services.AddSingleton<IAuthorizationPolicyProvider, AuthorizationPolicyProvider>();
builder.Services.AddSingleton<IAuthorizationHandler, FeatureTypeHandler>();
builder.Services.AddScoped<IClaimsTransformation, ClaimsTransformerService>();

builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration);

// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle

builder.Services.AddScoped<IHashPasswordService, HashPasswordService>();

builder.Services.Configure<TenantConnectionSettings>(options =>
    builder.Configuration.GetSection(nameof(TenantConnectionSettings)).Bind(options));

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Application"),
    b => b.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName)));

builder.Services.AddScoped<IJwtProvider, JwtProvider>();

////builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
////    .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme,
////        options => builder.Configuration.Bind("JwtSettings", options))
////    .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme,
////        options => builder.Configuration.Bind("CookieSettings", options));


//builder.Services.AddEndpointsApiExplorer();
//builder.Services.AddSwaggerGen();

builder.Services.AddJwtAuthenticationExtension(builder);

builder.Services.AddLocalizationExtension();

builder.Services.AddCors(o => o.AddPolicy("CorsPolicy", builder =>
{
    builder
    .AllowAnyMethod()
    .AllowAnyHeader()
    .AllowCredentials()
    .WithOrigins("http://localhost:4200");
}));

builder.Services.Configure<FormOptions>(o =>
{
    o.ValueLengthLimit = int.MaxValue;
    o.MultipartBodyLengthLimit = int.MaxValue;
    o.MemoryBufferThreshold = int.MaxValue;
});


builder.Services.AddRouting(options => options.LowercaseUrls = true);

//builder.Services.AddMediatR();

builder.Services.AddControllers();

builder.Services.AddSwaggerGen();
builder.Services.AddApiVersioningExtension();
builder.Services.AddHealthChecks();

var app = builder.Build();

// Configure the HTTP request pipeline.


app.UseHttpsRedirection();

app.UseStaticFiles();
app.UseRouting();
app.UseCors("CorsPolicy");

//app.UseStatusCodePages();
//app.UseStaticFiles();   

app.UseAuthentication();

app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseMiddleware<ErrorHandlerMiddleware>();
app.UseHealthChecks("/health");

//app.UseLocalizationExtension();

//app.MapControllers();

app.UseEndpoints(endpoints =>
{
    endpoints.MapControllers();
    //.RequireAuthorization()
    //.RequireCors("AllowSpecificOrigin");
});

app.Run();
