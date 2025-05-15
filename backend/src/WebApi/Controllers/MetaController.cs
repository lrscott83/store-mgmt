using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;
using System.Runtime.InteropServices;

namespace WebApi.Controllers
{
    /// <summary>
    /// This helpers controller.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    public class MetaController : ControllerBase
    {
        private readonly ILogger<MetaController> _logger;

        /// <summary>
        /// Constructor.
        /// </summary>
        /// <param name="logger"></param>
        /// <returns></returns>
        public MetaController(ILogger<MetaController> logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Get info from host.
        /// </summary>
        /// <returns>String</returns>
        [HttpGet("info")]
        public ActionResult<string> Info()
        {
            var assembly = typeof(Startup).Assembly;
            var lastUpdate = System.IO.File.GetLastWriteTime(assembly.Location);
            var version = FileVersionInfo.GetVersionInfo(assembly.Location).ProductVersion;
            var isWindows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
            var isMacOS = RuntimeInformation.IsOSPlatform(OSPlatform.OSX);
            var isLinux = RuntimeInformation.IsOSPlatform(OSPlatform.Linux);

            var osVersion = isWindows ? "Windows" : isLinux ? "Linux" : isMacOS ? "MacOS" : "Unknown";

            return Ok($"Version: {version}, Last Updated: {lastUpdate:U}, OS: {osVersion}, UTC Time: {DateTime.Now.ToString("F")}");
        }
    }
}
