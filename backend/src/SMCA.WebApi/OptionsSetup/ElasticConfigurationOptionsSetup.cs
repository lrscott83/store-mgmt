using Microsoft.Extensions.Options;
using SMCA.WebApi.Authentication;

namespace SMCA.WebApi.OptionsSetup
{
    public class ElasticConfigurationOptionsSetup : IConfigureOptions<ElasticConfigurationOptions>
    {
        private const string SectionName = "ElasticConfiguration";
        private readonly IConfiguration _configuration;

        public ElasticConfigurationOptionsSetup(IConfiguration configuration)
        {
            _configuration = configuration;
        }

        public void Configure(ElasticConfigurationOptions options)
        {
            _configuration.GetSection(SectionName).Bind(options);
        }
    }

    public class ElasticConfigurationOptions
    {
        public string Uri { get; init; }
    }
}
