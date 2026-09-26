using System.Text.Json;
using System.Text.Json.Serialization;

namespace Application.Features.Administration.Owners.Commands.CreateOwner
{
    /// <summary>
    /// Reads a nullable <see cref="Guid"/> from JSON, treating an empty or whitespace string as
    /// "no value" instead of a conversion failure.
    /// <para>
    /// Why this exists: the web client keeps <c>reSellerId</c> initialised to <c>""</c> and only
    /// renders the picker for a SuperAdmin, so a Gestor (ReSeller) actor always posts the empty
    /// string. System.Text.Json cannot convert <c>""</c> to <c>Guid?</c> in a JSON body — it
    /// throws and the WHOLE body fails to deserialize, which surfaced as a 400 carrying both
    /// "$.reSellerId" and the collateral "command is required". (An empty string DOES bind to
    /// null for query/form values via SimpleTypeModelBinder; that rule does not apply to a
    /// JSON body.)
    /// </para>
    /// <para>
    /// Deliberately narrow: applied to CreateOwnerCommand.ReSellerId only, via a
    /// property-level [JsonConverter] attribute. Changing the global JsonSerializerOptions
    /// would silently loosen every Guid? in the API.
    /// </para>
    /// <para>
    /// Only the empty/whitespace string is tolerated. A non-empty, non-Guid string still
    /// throws <see cref="JsonException"/>, so garbage keeps producing a 400 with the JSON path
    /// instead of being silently swallowed as "no Gestor".
    /// </para>
    /// </summary>
    public sealed class NullableGuidJsonConverter : JsonConverter<Guid?>
    {
        public override Guid? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            switch (reader.TokenType)
            {
                case JsonTokenType.Null:
                    return null;
                case JsonTokenType.String:
                    var text = reader.GetString();
                    if (string.IsNullOrWhiteSpace(text))
                        return null;
                    if (reader.TryGetGuid(out var value))
                        return value;
                    throw new JsonException($"The string '{text}' is not a valid Guid.");
                default:
                    throw new JsonException(
                        $"Unexpected token '{reader.TokenType}' when reading a nullable Guid.");
            }
        }

        public override void Write(Utf8JsonWriter writer, Guid? value, JsonSerializerOptions options)
        {
            if (value.HasValue)
                writer.WriteStringValue(value.Value);
            else
                writer.WriteNullValue();
        }
    }
}
