import { useIntl } from 'react-intl';
import { HelpIcon } from '~/shared/components/ui/icons';
import { showBlockingInfoHtml } from '~/shared/lib/blocking-alert';
import { currencyFromCode, formatMoneyWithCurrency } from '~/shared/lib/format-money-with-currency';
import { wholesaleDisplayOf } from '~/catalog/lib/catalog-wholesale';
import type { PublicCatalogProduct } from '~/sales/lib/services/catalog-http-service';

/**
 * "(i)" de la tarjeta mayorista: abre el popup con los rangos de precio, con el MISMO contenido y
 * las MISMAS claves que el POS (`SALES.WHOLESALE.TIERS_POPUP_*`).
 *
 * Se pinta como `<span role="button">` y NO como `<button>` a propósito: la tarjeta entera es un
 * `<button>` que abre el detalle, y un `<button>` dentro de otro es HTML inválido (el navegador
 * cierra el primero). El `stopPropagation` evita que tocar el ícono abra también el detalle.
 * `HelpIcon` dibuja el círculo con la "i" (el mismo glifo que usa el POS).
 */
export function WholesaleTiersInfo({
  product,
  className = '',
}: {
  readonly product: PublicCatalogProduct;
  readonly className?: string;
}) {
  const intl = useIntl();
  const wholesale = wholesaleDisplayOf(product);
  if (!wholesale) return null;

  const openTiers = () => {
    const currency = currencyFromCode(product.currency);
    const html = `
      <div style="text-align:left;font-size:14px;line-height:1.7">
        <p style="margin:0 0 8px"><strong>${intl.formatMessage({ id: 'SALES.WHOLESALE.TIERS_POPUP_PACK' })}:</strong> ${wholesale.packSize}</p>
        ${wholesale.tiers
          .map(
            (tier) =>
              `<p style="margin:0">${intl
                .formatMessage(
                  { id: 'SALES.WHOLESALE.TIERS_POPUP_FROM' },
                  {
                    min: tier.minPacks,
                    price: formatMoneyWithCurrency(tier.pricePerUnit, currency),
                    unit: wholesale.unitPlural,
                  },
                )
                .replace(/</g, '&lt;')}</p>`,
          )
          .join('')}
      </div>`;
    void showBlockingInfoHtml(
      intl.formatMessage({ id: 'SALES.WHOLESALE.TIERS_POPUP_TITLE' }),
      html,
    );
  };

  return (
    <span className={`whitespace-nowrap text-text-muted ${className}`.trim()}>
      {' ('}
      <span
        role="button"
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation();
          openTiers();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            event.stopPropagation();
            openTiers();
          }
        }}
        aria-label={intl.formatMessage({ id: 'SALES.WHOLESALE.TIERS_POPUP_TITLE' })}
        className="inline-flex cursor-pointer align-middle text-text-muted transition-colors hover:text-primary"
        data-testid={`catalog-wholesale-info-${product.id}`}
      >
        <HelpIcon className="h-4 w-4" />
      </span>
      {')'}
    </span>
  );
}
