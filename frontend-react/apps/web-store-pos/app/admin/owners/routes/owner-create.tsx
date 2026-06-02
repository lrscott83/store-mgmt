import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useIntl } from 'react-intl';
import { EFeatures } from '@store-mgmt/domain';
import { resellerFeatureLoader } from '~/auth/routes/loaders';
import { ownerHttpService } from '~/admin/owners/lib/services/owner-http-service';
import { resellerHttpService } from '~/admin/resellers/lib/services/reseller-http-service';
import { useAuthStore } from '~/shared/lib/stores/auth-store';
import { useUnsavedChangesPrompt } from '~/shared/lib/hooks/use-unsaved-changes-prompt';
import type { ReSeller } from '@store-mgmt/domain';

export const loader = resellerFeatureLoader([EFeatures.Owners]);

// ADR-3: EXACT copy from management/users/components/UserCreateForm.tsx:4
const PASSWORD_REGEX = /(?=\D*\d)(?=[^a-z]*[a-z])(?=[^A-Z]*[A-Z]).{8,30}/;

// ADR-4: Cuban +53 mobile format (from reseller-create.tsx:14)
const PHONE_REGEX = /^\+53\s?[0-9]\s?[0-9]{3}-?[0-9]{4}$/;

export function OwnerCreatePage() {
  const navigate = useNavigate();
  const intl = useIntl();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.isSuperAdmin ?? false;

  const [fullName, setFullName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [cellPhone, setCellPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [reSellerId, setReSellerId] = useState('');

  const [resellers, setResellers] = useState<ReSeller[]>([]);
  const [validationError, setValidationError] = useState('');
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDirty = Boolean(
    fullName || login || password || confirmPassword || cellPhone || email || description || reSellerId
  );

  // ADR-5: only the hook — no UnsavedChangesDialog
  useUnsavedChangesPrompt(isDirty);

  useEffect(() => {
    if (!isSuperAdmin) return;
    resellerHttpService.listResellers().then((res) => {
      setResellers(res.data);
    }).catch(() => {
      // non-critical — reseller list failure doesn't block form
    });
  }, [isSuperAdmin]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');
    setServerError('');

    // ADR-3: two-step password validation
    if (!PASSWORD_REGEX.test(password)) {
      setValidationError(intl.formatMessage({ id: 'OWNER.PASSWORD_POLICY' }));
      return;
    }

    if (password !== confirmPassword) {
      setValidationError(intl.formatMessage({ id: 'OWNER.PASSWORDS_MUST_MATCH' }));
      return;
    }

    // ADR-4: phone validation
    if (!PHONE_REGEX.test(cellPhone)) {
      setValidationError(intl.formatMessage({ id: 'OWNER.PHONE_FORMAT' }));
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await ownerHttpService.createOwner({
        fullName,
        login,
        password,
        cellPhone,
        email,
        description,
        reSellerId,
      });

      if (!res.succeeded) {
        setServerError(res.errors[0]?.description ?? intl.formatMessage({ id: 'OWNER.ERROR' }));
        return;
      }

      navigate('/management/stores/create');
    } catch {
      setServerError(intl.formatMessage({ id: 'OWNER.ERROR' }));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {intl.formatMessage({ id: 'OWNER.CREATE_TITLE' })}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        {(validationError || serverError) && (
          <p role="alert" className="text-sm text-red-600">
            {validationError || serverError}
          </p>
        )}

        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'USERS.FULL_NAME' })}
          </label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="login" className="block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'USERS.LOGIN' })}
          </label>
          <input
            id="login"
            type="text"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'USERS.PASSWORD' })}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'USERS.CONFIRM_PASSWORD' })}
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="cellPhone" className="block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'USERS.CELL_PHONE' })}
          </label>
          <input
            id="cellPhone"
            type="text"
            value={cellPhone}
            onChange={(e) => setCellPhone(e.target.value)}
            required
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'USERS.EMAIL' })}
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700">
            {intl.formatMessage({ id: 'STORES.DESCRIPTION' })}
          </label>
          <input
            id="description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {isSuperAdmin && (
          <div>
            <label htmlFor="reSellerId" className="block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'MENU.RESELLERS' })}
            </label>
            <select
              id="reSellerId"
              value={reSellerId}
              onChange={(e) => setReSellerId(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">--</option>
              {resellers.map((r) => (
                <option key={r.id as string} value={r.id as string}>
                  {r.fullName}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {intl.formatMessage({ id: 'USERS.SAVE' })}
        </button>
      </form>
    </div>
  );
}

export default OwnerCreatePage;
