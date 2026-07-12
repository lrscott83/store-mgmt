import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

// ─── react-router mock (keep real useSearchParams, mock only useNavigate) ────

const mockNavigate = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ─── authHttpService mock ──────────────────────────────────────────────────

vi.mock('~/shared/lib/http/auth-http-service', () => ({
  authHttpService: {
    register: vi.fn(),
  },
}));

// ─── ConnectivityService mock ──────────────────────────────────────────────

vi.mock('~/shared/lib/auth/connectivity-service', () => ({
  ConnectivityService: {
    isOnline: vi.fn().mockReturnValue(true),
  },
}));

import { authHttpService } from '~/shared/lib/http/auth-http-service';
import { ConnectivityService } from '~/shared/lib/auth/connectivity-service';
import RegisterPage from '../register';

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'Jane Doe' } });
  fireEvent.change(screen.getByLabelText(/^login$/i), { target: { value: 'janedoe' } });
  fireEvent.change(screen.getByLabelText(/^store name$/i), { target: { value: 'Jane Store' } });
  fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'jane@test.com' } });
  fireEvent.change(screen.getByLabelText(/phone number/i), { target: { value: '+5491100000' } });
  fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'Passw0rd!' } });
  fireEvent.change(screen.getByLabelText(/confirm password/i), {
    target: { value: 'Passw0rd!' },
  });
}

function renderRegister(initialEntries: string[] = ['/register']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <RegisterPage />
    </MemoryRouter>
  );
}

describe('RegisterPage — auth-http-register-parity call-site', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ConnectivityService.isOnline).mockReturnValue(true);
  });

  it('renders login and storeName inputs', () => {
    renderRegister();
    expect(screen.getByLabelText(/^login$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^store name$/i)).toBeInTheDocument();
  });

  it('does not render a visible input for code', () => {
    renderRegister(['/register?code=ABC123']);
    expect(screen.queryByLabelText(/code/i)).not.toBeInTheDocument();
  });

  it('succeeded:false shows errors[0].description and does not navigate', async () => {
    vi.mocked(authHttpService.register).mockResolvedValue({
      succeeded: false,
      data: false,
      message: '',
      actionCode: 400,
      errors: [{ code: 'LOGIN_TAKEN', description: 'Login already exists' }],
    });
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText('Login already exists')).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('succeeded:true navigates to /login', async () => {
    vi.mocked(authHttpService.register).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });
  });

  it('blocks submit on password/passwordConfirmation mismatch — register() never called', async () => {
    renderRegister();
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'Different1!' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/do not match|don't match/i)).toBeInTheDocument();
    });
    expect(authHttpService.register).not.toHaveBeenCalled();
  });

  it('?code=ABC123 flows into the register payload', async () => {
    vi.mocked(authHttpService.register).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });
    renderRegister(['/register?code=ABC123']);
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(authHttpService.register).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'ABC123' })
      );
    });
  });

  it('register() payload never includes passwordConfirmation', async () => {
    vi.mocked(authHttpService.register).mockResolvedValue({
      succeeded: true,
      data: true,
      message: '',
      actionCode: 0,
      errors: [],
    });
    renderRegister();
    fillRequiredFields();
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(authHttpService.register).toHaveBeenCalled();
    });
    const payload = vi.mocked(authHttpService.register).mock.calls[0][0];
    expect(payload).not.toHaveProperty('passwordConfirmation');
  });
});
