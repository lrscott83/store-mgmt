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

        /// <summary>
        /// Pins every request to Spanish ("siempre español"). Restricting the supported lists to
        /// "es" ALONE — rather than merely making it the default — is what turns the product
        /// decision into a guarantee: with "en" also listed, an <c>Accept-Language: en</c> header
        /// would resolve through I18n.en.resx and the response language would follow the caller.
        /// <para>
        /// There is no I18n.es.resx, so the pinned "es" culture resolves through the neutral
        /// I18n.resx, whose values are Spanish. I18n.en.resx is left in place and simply never
        /// selected.
        /// </para>
        /// <para>
        /// This is the SAME configuration as the live API's
        /// <c>SMCA.WebApi/Extensions/ServiceExtensions.cs</c>. This project is not a member of
        /// SMCA.sln, so it is not built or deployed; the copy is aligned so the two cannot state
        /// different things.
        /// </para>
        /// </summary>
        public static void UseLocalizationExtension(this IApplicationBuilder app)
        {
            var cultures = new List<CultureInfo>
            {
                new CultureInfo("es")
            };

            app.UseRequestLocalization(options =>
            {
                options.DefaultRequestCulture = new Microsoft.AspNetCore.Localization.RequestCulture("es");
                options.SupportedCultures = cultures;
                options.SupportedUICultures = cultures;
            });
        }
    }
}
