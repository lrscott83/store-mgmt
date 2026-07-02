import { Outlet } from 'react-router';
import { useIntl } from 'react-intl';

export default function AuthLayout() {
  const intl = useIntl();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-cyan-700">
            {intl.formatMessage({ id: 'GENERAL.APP_NAME' })}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {intl.formatMessage({ id: 'GENERAL.APP_SUBTITLE' })}
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
