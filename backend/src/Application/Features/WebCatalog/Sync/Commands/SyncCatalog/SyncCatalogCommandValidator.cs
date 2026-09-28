using Application.Dtos.WebCatalog;
using Domain.Common.Limits;
using FluentValidation;
using Microsoft.Extensions.Localization;
using Resources;

namespace Application.Features.WebCatalog.Sync.Commands.SyncCatalog
{
    /// <summary>
    /// El snapshot lo arma el POS, así que se valida como cualquier dato de entrada: topes de
    /// tamaño (defensa contra un cliente que mande megabytes), ids/nombres no vacíos y coherencia
    /// interna (un producto no puede apuntar a una categoría que no viene en el mismo snapshot).
    /// Sin snapshot no hay nada que validar: se publica el origen del servidor tal cual.
    /// </summary>
    public class SyncCatalogCommandValidator : AbstractValidator<SyncCatalogCommand>
    {
        /// <summary>Nombre máximo razonable: el POS no tiene tope propio y el campo es `text`.</summary>
        private const int NameSanityMaxLength = 512;

        public SyncCatalogCommandValidator(IStringLocalizer<I18n> localizer)
        {
            When(x => x.Snapshot != null, () =>
            {
                RuleFor(x => x.Snapshot!.Categories)
                    .Must(categories => categories.Count <= CatalogMirrorWriter.MaxCategories)
                    .WithMessage(localizer["CatalogSnapshotTooLarge", CatalogMirrorWriter.MaxCategories]);

                RuleFor(x => x.Snapshot!.Products)
                    .Must(products => products.Count <= CatalogMirrorWriter.MaxProducts)
                    .WithMessage(localizer["CatalogSnapshotTooLarge", CatalogMirrorWriter.MaxProducts]);

                RuleForEach(x => x.Snapshot!.Categories).ChildRules(category =>
                {
                    category.RuleFor(x => x.Id).NotEmpty();
                    category.RuleFor(x => x.Name).NotEmpty().MaximumLength(NameSanityMaxLength);
                });

                RuleForEach(x => x.Snapshot!.Products).ChildRules(product =>
                {
                    product.RuleFor(x => x.Id).NotEmpty();
                    product.RuleFor(x => x.CategoryId).NotEmpty();
                    product.RuleFor(x => x.Name).NotEmpty().MaximumLength(NameSanityMaxLength);
                    product.RuleFor(x => x.Price).GreaterThanOrEqualTo(0);
                    // `null` = "el snapshot no habla de la galería" (es lo que envía el POS, que no
                    // tiene fotos): no hay nada que validar. Solo una lista se compara con el tope.
                    product.RuleFor(x => x.Images)
                        .Must(images => images is null || images.Count <= ProductEntityLimits.MaxImagesPerProduct)
                        .WithMessage(localizer["CatalogImagesLimitReached", ProductEntityLimits.MaxImagesPerProduct]);
                    product.RuleForEach(x => x.Images)
                        .MaximumLength(ProductEntityLimits.ImagePathMaxLength)
                        .WithMessage(localizer["CatalogImagePathTooLong", "{PropertyName}", ProductEntityLimits.ImagePathMaxLength]);
                });

                RuleFor(x => x.Snapshot!).Custom((snapshot, context) =>
                {
                    var categoryIds = snapshot!.Categories.Select(category => category.Id).ToHashSet();
                    foreach (CatalogSnapshotProductDto product in snapshot.Products)
                    {
                        if (product.CategoryId != Guid.Empty && !categoryIds.Contains(product.CategoryId))
                            context.AddFailure(nameof(snapshot.Products),
                                localizer["CatalogSnapshotProductWithoutCategory", product.Name]);
                    }
                });
            });
        }
    }
}
