import { useIntl } from 'react-intl';
import { Link } from 'react-router';

/**
 * Matches Angular's `client-footer.component.html` (and the near-identical
 * `guest-footer.component.html`, reused here for the auth layout too): a
 * legal-link row (Cookies/Privacy/Terms/Contact) followed by a two-line
 * copyright block. Legal routes (/cookies-private, /private-police,
 * /terms-conditions) do not exist yet in React — links point at the Angular
 * paths as a placeholder; see apply-progress for the deferred-routes note.
 * The 3 legal links open in a new tab (`target="_blank"`), matching Angular's
 * `[routerLink]` + `target="_blank"` on every one of these anchors. Contact Us
 * is a no-op trigger — Angular's own `showEmailDialog()` handler is empty.
 */
export function Footer() {
  const intl = useIntl();
  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-2">
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 list-none m-0 p-0 text-xs">
        <li>
          <Link
            to="/cookies-private"
            target="_blank"
            className="underline text-gray-500 hover:text-primary transition-colors"
          >
            {intl.formatMessage({ id: 'FOOTER.COOKIES_POLICE' })}
          </Link>
        </li>
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
          <button type="button" onClick={() => {}} className="text-gray-500">
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
