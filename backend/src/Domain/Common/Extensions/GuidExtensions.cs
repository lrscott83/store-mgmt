using System;

namespace Domain.Common.Extensions
{
    public static class GuidExtensions
    {
        /// <summary>
        /// Converts a string to Guid if possible. Otherwise returns Guid.Empty
        /// </summary>
        /// <param name="s">String to be converted to Guid</param>
        /// <returns></returns>
        public static Guid ToGuid(this string s)
        {
            Guid result;
            if (Guid.TryParse(s, out result))
            {
                return result;
            }

            return Guid.Empty;
        }
    }
}
