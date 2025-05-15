using System.Globalization;
using Microsoft.AspNetCore.Mvc.ApiExplorer;
using Microsoft.OpenApi.Models;

namespace WebApi.Extensions
{
    public static class AppExtensions
    {
        public static void UseSwaggerExtension(this IApplicationBuilder app, IServiceCollection services, bool isProduction)
        {
            var provider = services.BuildServiceProvider();
            var service = provider.GetRequiredService<IApiVersionDescriptionProvider>();

            app.UseSwagger(c =>
            {
                c.RouteTemplate = "swagger/{documentName}/swagger.json";
                if (isProduction)
                    c.PreSerializeFilters.Add((swaggerDoc, httpReq) => swaggerDoc.Servers = new List<OpenApiServer>
                {
                    new() { Url = "/portal" }
                });
            });
            app.UseSwaggerUI(c =>
            {
                foreach (ApiVersionDescription description in service.ApiVersionDescriptions)
                {
                    c.SwaggerEndpoint($"{description.GroupName}/swagger.json", description.GroupName.ToUpperInvariant());
                }
            });
        }
        public static void UseErrorHandlingMiddleware(this IApplicationBuilder app)
        {
            //app.UseMiddleware<ErrorHandlerMiddleware>();
        }

        public static void UseLocalizationExtension(this IApplicationBuilder app)
        {
            var cultures = new List<CultureInfo>
            {
                new CultureInfo("en"),
                new CultureInfo("es")
            };

            app.UseRequestLocalization(options =>
            {
                options.DefaultRequestCulture = new Microsoft.AspNetCore.Localization.RequestCulture("en");
                options.SupportedCultures = cultures;
                options.SupportedUICultures = cultures;
            });
        }
    }
}
