using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Reflection;

namespace Domain.Common.Extensions
{
    public static class EnumExtensions
    {
        /// <summary>
        /// Get the Description attribute from an enum value (if any)
        /// </summary>
        /// <param name="value">the Enum value</param>
        /// <returns></returns>
        public static string GetDescription(this Enum value)
        {
            var attribute = value.GetType()
                .GetField(value.ToString())
                .GetCustomAttributes(typeof(DescriptionAttribute), false)
                .SingleOrDefault() as DescriptionAttribute;

            return attribute == null ? value.ToString() : attribute.Description;
        }

        /// <summary>
        /// Get the value of the enum from description
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="description"></param>
        /// <returns></returns>
        public static T GetValueFromDescription<T>(string description) where T : Enum
        {
            foreach (var field in typeof(T).GetFields())
            {
                if (Attribute.GetCustomAttribute(field,
                typeof(DescriptionAttribute)) is DescriptionAttribute attribute)
                {
                    if (attribute.Description == description)
                        return (T)field.GetValue(null);
                }
                else
                {
                    if (field.Name == description)
                        return (T)field.GetValue(null);
                }
            }

            //throw new ArgumentException("Not found.", nameof(description));
            return default(T);
        }

        /// <summary>
        /// Get Display Name attribute from an enum value (if any)
        /// </summary>
        /// <param name="enumValue">the Enum value</param>
        /// <returns></returns>
        public static string GetDisplayName(this Enum enumValue)
        {
            var attribute = enumValue.GetAttribute<DisplayAttribute>();              

            return string.IsNullOrEmpty(attribute?.Name) ? enumValue.ToString() : attribute.Name;
        }

        /// <summary>
        /// Get Display Description attribute from an enum value (if any)
        /// </summary>
        /// <param name="enumValue">the Enum value</param>
        /// <returns></returns>
        public static string GetDisplayDescription(this Enum enumValue)
        {
            var attribute = enumValue.GetAttribute<DisplayAttribute>();

            return string.IsNullOrEmpty(attribute?.Description) ? enumValue.ToString() : attribute.Description;
        }


        /// <summary>
        ///     A generic extension method that aids in reflecting 
        ///     and retrieving any attribute that is applied to an `Enum`.
        /// </summary>
        public static TAttribute GetAttribute<TAttribute>(this Enum enumValue)
                where TAttribute : Attribute
        {
            return enumValue.GetType()
                            .GetMember(enumValue.ToString())
                            .First()
                            .GetCustomAttribute<TAttribute>();
        }
    }
}
