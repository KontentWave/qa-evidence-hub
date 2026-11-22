import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../../app/login/page';
import { LoginForm } from '../components/login-form';
import { LogoutButton } from '../components/logout-button';
import * as apiModule from '../lib/api';

describe('LoginPage, LoginForm, and LogoutButton accessibility and auth boundary', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders /login for anonymous visitors with labeled controls and zero public registration links, and redirects already-signed-in owners to /', async () => {
    vi.spyOn(apiModule, 'getOptionalAuthenticatedOwner').mockResolvedValue(null);

    const ui = await LoginPage();
    render(ui);

    expect(screen.getByRole('heading', { level: 1, name: /Sign in to QA Evidence Hub/i })).toBeTruthy();
    expect(screen.getByLabelText(/Login identifier/i)).toBeTruthy();
    expect(screen.getByLabelText(/Password/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Sign in$/i })).toBeTruthy();
    expect(screen.queryByText(/sign up|create account|register/i)).toBeNull();

    cleanup();
    vi.spyOn(apiModule, 'getOptionalAuthenticatedOwner').mockResolvedValue({
      id: '11111111-2222-4333-8444-555555555555',
      loginIdentifier: 'owner@synthetic.invalid',
      timezone: 'Europe/Bratislava',
    });
    vi.spyOn(apiModule, 'redirectToPath').mockImplementation((target: string) => {
      throw new Error(`REDIRECT:${target}`);
    });

    await expect(LoginPage()).rejects.toThrow('REDIRECT:/');
  });

  it('moves focus to visible error summary on validation or 401 failure while preserving non-sensitive login identifier', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/api/v1/auth/csrf')) {
        return new Response(JSON.stringify({ csrfToken: 't'.repeat(43) }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url.endsWith('/api/v1/auth/login') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({ code: 'UNAUTHORIZED', message: 'Authentication is required.' }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(null, { status: 500 });
    });

    render(<LoginForm fetchImpl={fetchMock} onNavigate={vi.fn()} />);

    // 1. Empty submission focuses error summary and links to missing fields.
    fireEvent.click(screen.getByRole('button', { name: /^Sign in$/i }));
    const summaryAfterEmpty = await screen.findByRole('alert');
    await waitFor(() => {
      expect(document.activeElement).toBe(summaryAfterEmpty);
    });
    expect(summaryAfterEmpty.textContent).toMatch(/Enter your login identifier/i);

    // 2. Invalid credentials preserve loginIdentifier, clear password, and focus error summary.
    const idInput = screen.getByLabelText(/Login identifier/i) as HTMLInputElement;
    const pwInput = screen.getByLabelText(/Password/i) as HTMLInputElement;

    fireEvent.change(idInput, { target: { value: 'owner@synthetic.invalid' } });
    fireEvent.change(pwInput, { target: { value: 'WrongPassword!2026' } });
    fireEvent.click(screen.getByRole('button', { name: /^Sign in$/i }));

    await waitFor(() => {
      const alertEl = screen.getByRole('alert');
      expect(alertEl.textContent).toMatch(/Invalid login identifier or password/i);
      expect(document.activeElement).toBe(alertEl);
    });
    expect(idInput.value).toBe('owner@synthetic.invalid');
    expect(pwInput.value).toBe('');
  });

  it('submits login and logout directly to /api/v1/auth/* with X-CSRF-Token and navigates on success', async () => {
    const seenRequests: Array<{ url: string; method: string; csrf: string | null }> = [];
    const fetchMock = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      const hdrs = new Headers(init?.headers);
      seenRequests.push({ url, method, csrf: hdrs.get('x-csrf-token') });

      if (url === '/api/v1/auth/csrf') {
        return new Response(JSON.stringify({ csrfToken: 'csrf_token_value_12345678901234567890' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/v1/auth/login') {
        return new Response(
          JSON.stringify({
            authenticated: true,
            owner: {
              id: '11111111-2222-4333-8444-555555555555',
              loginIdentifier: 'owner@synthetic.invalid',
              timezone: 'Europe/Bratislava',
            },
            csrfToken: 'fresh_authenticated_csrf_1234567890123456',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url === '/api/v1/auth/logout') {
        return new Response(JSON.stringify({ authenticated: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(null, { status: 404 });
    });

    const navigateSpy = vi.fn();
    render(<LoginForm fetchImpl={fetchMock} onNavigate={navigateSpy} />);

    fireEvent.change(screen.getByLabelText(/Login identifier/i), {
      target: { value: 'owner@synthetic.invalid' },
    });
    fireEvent.change(screen.getByLabelText(/Password/i), {
      target: { value: 'ValidSyntheticPass!2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Sign in$/i }));

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith('/');
    });
    expect(seenRequests.some((r) => r.url === '/api/v1/auth/login' && r.csrf === 'csrf_token_value_12345678901234567890')).toBe(true);

    cleanup();
    const logoutNavSpy = vi.fn();
    render(<LogoutButton fetchImpl={fetchMock} onNavigate={logoutNavSpy} />);
    fireEvent.click(screen.getByRole('button', { name: /Sign out/i }));

    await waitFor(() => {
      expect(logoutNavSpy).toHaveBeenCalledWith('/login');
    });
    expect(seenRequests.some((r) => r.url === '/api/v1/auth/logout' && r.csrf === 'csrf_token_value_12345678901234567890')).toBe(true);
  });
});
