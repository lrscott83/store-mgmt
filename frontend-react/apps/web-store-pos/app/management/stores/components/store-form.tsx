import { useState } from 'react';
import { useIntl } from 'react-intl';
import type { OpeningHoursEntry, Owner, Store, WeekdayName } from '@store-mgmt/domain';
import { Card } from '~/shared/components/ui/card';
import { Button } from '~/shared/components/ui/button';
import { PlusIcon, EditIcon } from '~/shared/components/ui/icons';

interface StoreFormValues {
  name: string;
  address: string;
  description: string;
  ownerId: string;
  approved: boolean;
  paymentStartDate: string;
  isActive: boolean;
  // public-catalog-static-pages (T8): public location block, edit mode only.
  publicPhone: string;
  addressCity: string;
  addressProvince: string;
  // Coordinates stay strings in the form (same as paymentStartDate); the route
  // converts them to numbers on the wire. Empty means "no coordinates".
  latitude: string;
  longitude: string;
  openingHours: OpeningHoursEntry[];
}

/** Canonical weekday order — same order the backend serializer emits. */
const WEEKDAYS: WeekdayName[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const DAY_LABEL_IDS: Record<WeekdayName, string> = {
  Monday: 'STORES.DAY_MONDAY',
  Tuesday: 'STORES.DAY_TUESDAY',
  Wednesday: 'STORES.DAY_WEDNESDAY',
  Thursday: 'STORES.DAY_THURSDAY',
  Friday: 'STORES.DAY_FRIDAY',
  Saturday: 'STORES.DAY_SATURDAY',
  Sunday: 'STORES.DAY_SUNDAY',
};

interface DayHours {
  opens: string;
  closes: string;
}

/** One empty row per weekday; the store's canonical entries fill their day. */
function initialHours(initialValues?: Partial<Store>): Record<WeekdayName, DayHours> {
  const hours = {} as Record<WeekdayName, DayHours>;
  for (const day of WEEKDAYS) {
    hours[day] = { opens: '', closes: '' };
  }
  for (const entry of initialValues?.openingHours ?? []) {
    hours[entry.day] = { opens: entry.opens, closes: entry.closes };
  }
  return hours;
}

interface StoreFormProps {
  owners: Owner[];
  initialValues?: Partial<Store>;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isOwnerAdmin: boolean;
  isEditMode: boolean;
  onSubmit: (values: StoreFormValues) => void;
  error?: string;
}

/**
 * L5 parity: shared Card/Button chrome + icons (`shared/components/ui/{card,button,icons}.tsx`),
 * same precedent as Expenses — matches Angular's `.card`/`mat-fab extended` chrome
 * (edit-store.component.html:1,157-164). Fields themselves keep their existing markup/roles.
 */
export function StoreForm({
  owners,
  initialValues,
  isLoading,
  isSuperAdmin,
  isOwnerAdmin,
  isEditMode,
  onSubmit,
  error,
}: StoreFormProps) {
  const intl = useIntl();

  const [name, setName] = useState(initialValues?.name ?? '');
  const [address, setAddress] = useState(initialValues?.address ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [ownerId, setOwnerId] = useState(initialValues?.ownerId ?? '');
  const [approved, setApproved] = useState(initialValues?.approved ?? false);
  const [paymentStartDate, setPaymentStartDate] = useState(
    initialValues?.paymentStartDate
      ? new Date(initialValues.paymentStartDate).toISOString().split('T')[0]
      : '',
  );
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? false);
  const [publicPhone, setPublicPhone] = useState(initialValues?.publicPhone ?? '');
  const [addressCity, setAddressCity] = useState(initialValues?.addressCity ?? '');
  const [addressProvince, setAddressProvince] = useState(initialValues?.addressProvince ?? '');
  const [latitude, setLatitude] = useState(
    initialValues?.latitude != null ? String(initialValues.latitude) : '',
  );
  const [longitude, setLongitude] = useState(
    initialValues?.longitude != null ? String(initialValues.longitude) : '',
  );
  const [hours, setHours] = useState<Record<WeekdayName, DayHours>>(() =>
    initialHours(initialValues),
  );
  const [validationError, setValidationError] = useState('');

  const isAdminUser = isSuperAdmin || isOwnerAdmin;
  const submitDisabled = isLoading;
  const inputClass =
    'mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60';

  function setDayHours(day: WeekdayName, field: keyof DayHours, value: string) {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setValidationError('');
    if (!name.trim()) {
      setValidationError(intl.formatMessage({ id: 'STORES.NAME_REQUIRED' }));
      return;
    }
    // Req: Field-Name-Aware Required Validation (Angular GENERAL.VALIDATION.REQUIRED : { name })
    if (isAdminUser && !ownerId) {
      setValidationError(intl.formatMessage({ id: 'STORES.OWNER_REQUIRED' }));
      return;
    }
    if (isSuperAdmin && isEditMode && !paymentStartDate) {
      setValidationError(intl.formatMessage({ id: 'STORES.PAYMENT_START_DATE_REQUIRED' }));
      return;
    }
    // T8: coordinates are a pair or nothing — the backend rejects a lone value,
    // so the form never sends one.
    const hasLatitude = latitude.trim() !== '';
    const hasLongitude = longitude.trim() !== '';
    if (hasLatitude !== hasLongitude) {
      setValidationError(intl.formatMessage({ id: 'STORES.COORDINATES_PAIR_REQUIRED' }));
      return;
    }
    // A day is open only when BOTH times are set; a half-filled day is a
    // mistake, not "closed".
    const openingHours = WEEKDAYS.map((day) => ({ day, ...hours[day] })).filter(
      (entry) => entry.opens !== '' || entry.closes !== '',
    );
    if (openingHours.some((entry) => entry.opens === '' || entry.closes === '')) {
      setValidationError(intl.formatMessage({ id: 'STORES.OPENING_HOURS_INCOMPLETE' }));
      return;
    }
    onSubmit({
      name,
      address,
      description,
      ownerId,
      approved,
      paymentStartDate,
      isActive,
      publicPhone,
      addressCity,
      addressProvince,
      latitude,
      longitude,
      openingHours,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {(validationError || error) && (
        <p role="alert" className="text-sm text-danger">
          {validationError || error}
        </p>
      )}

      <Card
        footer={
          <div className="text-center">
            <Button type="submit" variant="fab" disabled={submitDisabled}>
              {isEditMode ? <EditIcon /> : <PlusIcon />}
              {isLoading
                ? intl.formatMessage({ id: 'STORES.SAVING' })
                : intl.formatMessage({ id: 'STORES.SAVE' })}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="store-name" className="block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'STORES.NAME' })}
            </label>
            <input
              id="store-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              aria-label={intl.formatMessage({ id: 'STORES.NAME' })}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="store-address" className="block text-sm font-medium text-gray-700">
              {intl.formatMessage({ id: 'STORES.ADDRESS' })}
            </label>
            <input
              id="store-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={isLoading}
              aria-label={intl.formatMessage({ id: 'STORES.ADDRESS' })}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
            />
          </div>

          {isEditMode && (
            // T8: the public catalog page carries this data as LocalBusiness
            // JSON-LD. Edit mode only — the create flow has no location block and
            // never sends one.
            <div className="space-y-4 rounded border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700">
                {intl.formatMessage({ id: 'STORES.LOCATION_TITLE' })}
              </h3>

              <div>
                <label
                  htmlFor="store-public-phone"
                  className="block text-sm font-medium text-gray-700"
                >
                  {intl.formatMessage({ id: 'STORES.PUBLIC_PHONE' })}
                </label>
                <input
                  id="store-public-phone"
                  type="tel"
                  value={publicPhone}
                  onChange={(e) => setPublicPhone(e.target.value)}
                  disabled={isLoading}
                  aria-label={intl.formatMessage({ id: 'STORES.PUBLIC_PHONE' })}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="store-address-city"
                    className="block text-sm font-medium text-gray-700"
                  >
                    {intl.formatMessage({ id: 'STORES.ADDRESS_CITY' })}
                  </label>
                  <input
                    id="store-address-city"
                    type="text"
                    value={addressCity}
                    onChange={(e) => setAddressCity(e.target.value)}
                    disabled={isLoading}
                    aria-label={intl.formatMessage({ id: 'STORES.ADDRESS_CITY' })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="store-address-province"
                    className="block text-sm font-medium text-gray-700"
                  >
                    {intl.formatMessage({ id: 'STORES.ADDRESS_PROVINCE' })}
                  </label>
                  <input
                    id="store-address-province"
                    type="text"
                    value={addressProvince}
                    onChange={(e) => setAddressProvince(e.target.value)}
                    disabled={isLoading}
                    aria-label={intl.formatMessage({ id: 'STORES.ADDRESS_PROVINCE' })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="store-latitude"
                    className="block text-sm font-medium text-gray-700"
                  >
                    {intl.formatMessage({ id: 'STORES.LATITUDE' })}
                  </label>
                  <input
                    id="store-latitude"
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    disabled={isLoading}
                    aria-label={intl.formatMessage({ id: 'STORES.LATITUDE' })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    htmlFor="store-longitude"
                    className="block text-sm font-medium text-gray-700"
                  >
                    {intl.formatMessage({ id: 'STORES.LONGITUDE' })}
                  </label>
                  <input
                    id="store-longitude"
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    disabled={isLoading}
                    aria-label={intl.formatMessage({ id: 'STORES.LONGITUDE' })}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700">
                  {intl.formatMessage({ id: 'STORES.OPENING_HOURS' })}
                </span>
                <p className="text-xs text-gray-500">
                  {intl.formatMessage({ id: 'STORES.OPENING_HOURS_HINT' })}
                </p>
                <div className="mt-2 space-y-2">
                  {WEEKDAYS.map((day) => (
                    <div key={day} className="flex items-center gap-2">
                      <span className="w-24 shrink-0 text-sm text-gray-700">
                        {intl.formatMessage({ id: DAY_LABEL_IDS[day] })}
                      </span>
                      <input
                        type="time"
                        value={hours[day].opens}
                        onChange={(e) => setDayHours(day, 'opens', e.target.value)}
                        disabled={isLoading}
                        aria-label={`${intl.formatMessage({ id: 'STORES.OPENS' })} ${intl.formatMessage({ id: DAY_LABEL_IDS[day] })}`}
                        className={inputClass}
                      />
                      <input
                        type="time"
                        value={hours[day].closes}
                        onChange={(e) => setDayHours(day, 'closes', e.target.value)}
                        disabled={isLoading}
                        aria-label={`${intl.formatMessage({ id: 'STORES.CLOSES' })} ${intl.formatMessage({ id: DAY_LABEL_IDS[day] })}`}
                        className={inputClass}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {isAdminUser && (
            <div>
              <label
                htmlFor="store-description"
                className="block text-sm font-medium text-gray-700"
              >
                {intl.formatMessage({ id: 'STORES.DESCRIPTION' })}
              </label>
              <textarea
                id="store-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isLoading}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
              />
            </div>
          )}

          {isAdminUser && (
            <div>
              <label htmlFor="store-owner" className="block text-sm font-medium text-gray-700">
                {intl.formatMessage({ id: 'STORES.OWNER' })}
              </label>
              <select
                id="store-owner"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                disabled={isLoading || isEditMode}
                aria-label={intl.formatMessage({ id: 'STORES.OWNER' })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
              >
                <option value="">--</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.fullName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isAdminUser && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="store-approved"
                checked={approved}
                onChange={(e) => setApproved(e.target.checked)}
                disabled={isLoading}
              />
              <label htmlFor="store-approved" className="text-sm font-medium text-gray-700">
                {intl.formatMessage({ id: 'STORES.APPROVED' })}
              </label>
            </div>
          )}

          {isSuperAdmin && isEditMode && (
            <div>
              <label
                htmlFor="store-payment-start"
                className="block text-sm font-medium text-gray-700"
              >
                {intl.formatMessage({ id: 'STORES.PAYMENT_START_DATE' })}
              </label>
              <input
                id="store-payment-start"
                type="date"
                value={paymentStartDate}
                onChange={(e) => setPaymentStartDate(e.target.value)}
                disabled={isLoading}
                aria-label={intl.formatMessage({ id: 'STORES.PAYMENT_START_DATE' })}
                className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none disabled:opacity-60"
              />
            </div>
          )}

          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="store-is-active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={isLoading}
              />
              <label htmlFor="store-is-active" className="text-sm font-medium text-gray-700">
                {intl.formatMessage({ id: 'STORES.IS_ACTIVE' })}
              </label>
            </div>
          )}
        </div>
      </Card>
    </form>
  );
}

export default StoreForm;
