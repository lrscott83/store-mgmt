import { useIntl } from 'react-intl';

export function Footer() {
  const intl = useIntl();
  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 border-t border-gray-200 bg-white px-4 py-2">
      <p className="text-xs text-gray-400 text-center">
        {intl.formatMessage({ id: 'FOOTER.COPYRIGHT' }, { year })}
      </p>
    </footer>
  );
}
