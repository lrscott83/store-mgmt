import { useIntl } from 'react-intl';
import { Link } from 'react-router';
import { EmailIcon } from './ui/icons';

interface FooterProps {
  /**
   * `client` (default) mirrors Angular's `client-footer.component.scss`, which is
   * EMPTY — plain link styling, no pill. `guest` mirrors
   * `guest-footer.component.scss` `.contact-item .contact-link`: only the Contact
   * trigger gets the gold pill (border, tinted background, rounded, `#f5b026`
   * icon, hover states). Angular's guest legal links also get a cream/gold
   * palette in that stylesheet, but that palette is dark-theme-only — it
   * depends on `login.component.scss` setting `--color-bg: #0a0a0a` behind it.
   * React's auth layout is light (`bg-gray-50` / white footer), an accepted,
   * pre-existing divergence, so the legal links intentionally stay on the
   * shared light-theme styling below and are NOT restyled. Only the Contact
   * pill's text/hover colors are adapted here (kept legible on white) while
   * preserving the gold accent and Angular's intent of a muted label that
   * emphasizes on hover.
   */
  variant?: 'client' | 'guest';
}

/**
 * Matches Angular's `client-footer.component.html` (and the near-identical
 * `guest-footer.component.html`, reused here for the auth layout too via
 * `variant="guest"`): a legal-link row (Privacy/Terms/Contact)
 * followed by a two-line copyright block. Legal routes (/private-police,
 * /terms-conditions) do not exist yet in React — links point
 * at the Angular paths as a placeholder; see apply-progress for the
 * deferred-routes note. The 2 legal links open in a new tab
 * (`target="_blank"`), matching Angular's `[routerLink]` + `target="_blank"`
 * on every one of these anchors. Contact Us is a no-op trigger — Angular's own
 * `showEmailDialog()` handler is empty.
 */
export function Footer({ variant = 'client' }: FooterProps = {}) {
  const intl = useIntl();
  const year = new Date().getFullYear();
  const isGuest = variant === 'guest';

  return (
    <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-2">
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 list-none m-0 p-0 text-xs">
        <li>
          <Link
            to="/private-police"
            target="_blank"
            className="underline text-gray-500 hover:text-primary transition-colors"
          >
            {intl.formatMessage({ id: 'FOOTER.PRIVACY_POLICE' })}
          </Link>
        </li>
        <li>
          <Link
            to="/terms-conditions"
            target="_blank"
            className="underline text-gray-500 hover:text-primary transition-colors"
          >
            {intl.formatMessage({ id: 'FOOTER.TERMS_CONDITIONS' })}
          </Link>
        </li>
        <li>
          <button
            type="button"
            onClick={() => {}}
            className={
              isGuest
                ? 'inline-flex items-center gap-1.5 rounded-full border border-[rgba(245,176,38,0.25)] bg-[rgba(245,176,38,0.08)] px-3.5 py-1.5 text-gray-700 transition-colors hover:border-[rgba(245,176,38,0.4)] hover:bg-[rgba(245,176,38,0.15)] hover:text-text'
                : 'inline-flex items-center gap-1 text-gray-500'
            }
          >
            <EmailIcon className={isGuest ? 'h-4 w-4 text-[#f5b026]' : 'h-4 w-4'} />
            {intl.formatMessage({ id: 'FOOTER.CONTACT_US' })}
          </button>
        </li>
      </ul>
      <p className="text-xs text-gray-400 text-center mt-2 mb-0">
        {intl.formatMessage({ id: 'FOOTER.COPYRIGHT1' }, { year })}
      </p>
      <p className="text-xs text-gray-400 text-center m-0">
        {intl.formatMessage({ id: 'FOOTER.COPYRIGHT2' })}
      </p>
    </footer>
  );
}
