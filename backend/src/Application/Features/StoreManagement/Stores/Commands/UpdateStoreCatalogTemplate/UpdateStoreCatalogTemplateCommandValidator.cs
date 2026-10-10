using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.StoreManagement.Stores.Commands.UpdateStoreCatalogTemplate
{
    /// <summary>
    /// La plantilla es un id PREDEFINIDO: obligatorio y en kebab-case (minúsculas, empieza por
    /// letra, guiones, máx. 64). Se reutiliza el mensaje localizado de la extinta validación de
    /// plantilla de la marca (<c>BrandingInvalidTemplate</c>): el contrato del id es el mismo.
    /// </summary>
    public class UpdateStoreCatalogTemplateCommandValidator
        : AbstractValidator<UpdateStoreCatalogTemplateCommand>
    {
        /// <summary>Id de plantilla: minúsculas, empieza por letra, guiones, máx. 64.</summary>
        private const string TemplateIdPattern = "^[a-z][a-z0-9-]{0,63}$";

        public UpdateStoreCatalogTemplateCommandValidator(IStringLocalizer<I18n> localizer)
        {
            RuleFor(x => x.StoreId).NotEmpty();

            RuleFor(x => x.TemplateId)
                .NotEmpty()
                .Matches(TemplateIdPattern)
                .WithMessage(localizer["BrandingInvalidTemplate", nameof(UpdateStoreCatalogTemplateCommand.TemplateId)]);
        }
    }
}
