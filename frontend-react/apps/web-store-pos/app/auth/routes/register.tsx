import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ConnectivityService } from '~/shared/lib/auth/connectivity-service';
import { authHttpService } from '~/shared/lib/http/auth-http-service';
import { guestOnlyLoader } from './loaders';

export const clientLoader = guestOnlyLoader;

interface FormState {
  fullName: string;
  email: string;
  cellPhone: string;
  password: string;
  passwordConfirmation: string;
}

interface FormErrors {
  fullName?: string;
  email?: string;
  cellPhone?: string;
  password?: string;
  passwordConfirmation?: string;
  form?: string;
}

export default function RegisterPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState<FormState>({
    fullName: '',
    email: '',
    cellPhone: '',
    password: '',
    passwordConfirmation: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!form.fullName.trim()) errs.fullName = 'Full name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    if (!form.cellPhone.trim()) errs.cellPhone = 'Phone number is required';
    if (!form.password) errs.password = 'Password is required';
    if (!form.passwordConfirmation) {
      errs.passwordConfirmation = 'Please confirm your password';
    } else if (form.password !== form.passwordConfirmation) {
      errs.passwordConfirmation = 'Passwords do not match';
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setIsOffline(false);

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    if (!ConnectivityService.isOnline()) {
      setIsOffline(true);
      return;
    }

    setIsLoading(true);
    try {
      await authHttpService.register({
        fullName: form.fullName,
        email: form.email,
        cellPhone: form.cellPhone,
        password: form.password,
        passwordConfirmation: form.passwordConfirmation,
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status: number; data?: { message?: string } } };
      const status = axiosErr.response?.status;
      const message = axiosErr.response?.data?.message;
      if (status === 400) {
        if (message?.toLowerCase().includes('email')) {
          setErrors({ email: 'This email is already registered' });
        } else {
          setErrors({ form: message ?? 'Validation error. Please check your data.' });
        }
      } else {
        setErrors({ form: 'Something went wrong. Please try again.' });
      }
    } finally {
      setIsLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center py-4">
        <p className="text-green-600 font-medium">Account created! Redirecting to login…</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-800 mb-6">Create your account</h2>

      {isOffline && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          You are offline. An internet connection is required to register.
        </div>
      )}

      {errors.form && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {errors.form}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="mb-4">
          <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.fullName && (
            <p className="mt-1 text-xs text-red-600">{errors.fullName}</p>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email}</p>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="cellPhone" className="block text-sm font-medium text-gray-700 mb-1">
            Phone number
          </label>
          <input
            id="cellPhone"
            type="tel"
            autoComplete="tel"
            value={form.cellPhone}
            onChange={(e) => setForm((f) => ({ ...f, cellPhone: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.cellPhone && (
            <p className="mt-1 text-xs text-red-600">{errors.cellPhone}</p>
          )}
        </div>

        <div className="mb-4">
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password}</p>
          )}
        </div>

        <div className="mb-6">
          <label htmlFor="passwordConfirmation" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm password
          </label>
          <input
            id="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            value={form.passwordConfirmation}
            onChange={(e) => setForm((f) => ({ ...f, passwordConfirmation: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          />
          {errors.passwordConfirmation && (
            <p className="mt-1 text-xs text-red-600">{errors.passwordConfirmation}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link to="/login" className="text-cyan-600 hover:text-cyan-700 font-medium">
          Sign in
        </Link>
      </div>
    </div>
  );
}
