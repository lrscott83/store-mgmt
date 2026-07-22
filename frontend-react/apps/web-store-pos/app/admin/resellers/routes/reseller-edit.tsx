import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useIntl } from 'react-intl';
import { superAdminLoader } from '~/auth/routes/loaders';
import { resellerHttpService } from '~/admin/resellers/lib/services/reseller-http-service';
import { useUnsavedChangesPrompt } from '~/shared/lib/hooks/use-unsaved-changes-prompt';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon, EditIcon } from '~/shared/components/ui/icons';
import type { ReSeller } from '@store-mgmt/domain';

export const clientLoader = superAdminLoader;

// ADR-4: Cuban +53 mobile format
const PHONE_REGEX = /^\+53\s?[0-9]\s?[0-9]{3}-?[0-9]{4}$/;

interface Snapshot {
  fullName: string;
  cellPhone: string;
  email: string;
  percentDiscountPrice: number;
  discountPrice: number;
  isActive: boolean;
  description: string;
}

function makeSnapshot(r: ReSeller): Snapshot {
  return {
    fullName: r.fullName,
    cellPhone: r.cellPhone,
    email: r.email,
    percentDiscountPrice: r.percentDiscountPrice,
    discountPrice: r.discountPrice,
    isActive: r.isActive,
    description: r.description,
  };
}

export function ResellerEditPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { formatMessage } = useIntl();

  const [reseller, setReseller] = useState<ReSeller | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState('');

  // Editable fields
  const [login, setLogin] = useState('');
  const [fullName, setFullName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [percentDiscountPrice, setPercentDiscountPrice] = useState(0);
  const [discountPrice, setDiscountPrice] = useState(0);
  const [cellPhone, setCellPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');

  const [validationError, setValidationError] = useState('');
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dirty = any tracked field differs from snapshot
  const isDirty = snapshot
    ? fullName !== snapshot.fullName ||
      cellPhone !== snapshot.cellPhone ||
      email !== snapshot.email ||
      percentDiscountPrice !== snapshot.percentDiscountPrice ||
      discountPrice !== snapshot.discountPrice ||
      isActive !== snapshot.isActive ||
      description !== snapshot.description
    : false;

  // ADR-5: only the hook
  useUnsavedChangesPrompt(isDirty);

  useEffect(() => {
    if (!id) return;
    resellerHttpService
      .getReseller(id)
      .then((res) => {
        const r = res.data;
        setReseller(r);
        setLogin(r.login ?? '');
        setFullName(r.fullName);
        setIsActive(r.isActive);
        setPercentDiscountPrice(r.percentDiscountPrice);
        setDiscountPrice(r.discountPrice);
        setCellPhone(r.cellPhone);
        setEmail(r.email);
        setDescription(r.description);
        setSnapshot(makeSnapshot(r));
        setLoadError('');
      })
      .catch(() => {
        setLoadError(formatMessage({ id: 'RESELLERS.ERROR' }));
      });
  }, [id, formatMessage]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');
    setServerError('');

    if (!PHONE_REGEX.test(cellPhone)) {
      setValidationError(formatMessage({ id: 'RESELLERS.PHONE_FORMAT' }));
      return;
    }

    if (!id) return;

    setIsSubmitting(true);
    try {
      const res = await resellerHttpService.updateReseller(id, {
        fullName,
        cellPhone,
        email,
        percentDiscountPrice,
        discountPrice,
        isActive,
        description,
      });

      if (!res.succeeded) {
        setServerError(res.errors[0]?.description ?? formatMessage({ id: 'RESELLERS.ERROR' }));
        return;
      }

      // Re-snapshot after successful PUT — stay on page
      setSnapshot({ fullName, cellPhone, email, percentDiscountPrice, discountPrice, isActive, description });
    } catch {
      setServerError(formatMessage({ id: 'RESELLERS.ERROR' }));
    } finally {
      setIsSubmitting(false);
    }
  }

  // edit-reseller.component.ts:12-13 (navigateToCreateReSeller): the Angular handler
  // body is empty — a no-op. Mirrored literally here, not implemented as a real
  // create-navigation flow.
  function navigateToCreateReSeller() {}

  if (loadError) {
    return (
      <div className="space-y-4 p-4">
        <p role="alert" className="text-sm text-red-600">{loadError}</p>
      </div>
    );
  }

  if (!reseller) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-gray-500">{formatMessage({ id: 'GENERAL.LOADING' })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-xl font-semibold">
        {formatMessage({ id: 'RESELLERS.EDIT_TITLE' })}
      </h1>

      {/* edit-reseller.component.html:4-9 — card-toolbar "+" fab, distinct from the
          details-form submit fab below. */}
      <div className="flex justify-end">
        <Button type="button" variant="fab" onClick={navigateToCreateReSeller}>
          <PlusIcon />
          {formatMessage({ id: 'RESELLER.ADD_RESELLER' })}
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {(validationError || serverError) && (
          <p role="alert" className="text-sm text-red-600">
            {validationError || serverError}
          </p>
        )}

        <div>
          <label htmlFor="login" className="block text-sm font-medium text-gray-700">
            {formatMessage({ id: 'USERS.LOGIN' })}
          </label>
          <input
            id="login"
            type="text"
            value={login}
            disabled
            readOnly
            className="mt-1 block w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
          />
        </div>

        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
            {formatMessage({ id: 'GENERAL.FULL_NAME' })}
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

        <div className="flex items-center gap-2">
          <input
            id="isActive"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
            {formatMessage({ id: 'USERS.IS_ACTIVE' })}
          </label>
        </div>

        <div>
          <label htmlFor="percentDiscountPrice" className="block text-sm font-medium text-gray-700">
            {formatMessage({ id: 'RESELLERS.PERCENT_DISCOUNT' })}
          </label>
          <input
            id="percentDiscountPrice"
            type="number"
            min={0}
            value={percentDiscountPrice}
            onChange={(e) => setPercentDiscountPrice(Number(e.target.value))}
            required
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="discountPrice" className="block text-sm font-medium text-gray-700">
            {formatMessage({ id: 'RESELLERS.DISCOUNT_PRICE' })}
          </label>
          <input
            id="discountPrice"
            type="number"
            min={0}
            value={discountPrice}
            onChange={(e) => setDiscountPrice(Number(e.target.value))}
            required
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="cellPhone" className="block text-sm font-medium text-gray-700">
            {formatMessage({ id: 'GENERAL.CELL_PHONE' })}
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
            {formatMessage({ id: 'GENERAL.EMAIL' })}
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
            {formatMessage({ id: 'GENERAL.DESCRIPTION' })}
          </label>
          <input
            id="description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <Button type="submit" variant="fab" disabled={!isDirty || isSubmitting}>
          <EditIcon />
          {formatMessage({ id: 'GENERAL.UPDATE' })}
        </Button>
      </form>
    </div>
  );
}

export default ResellerEditPage;
