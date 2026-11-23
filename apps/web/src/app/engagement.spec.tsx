import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClientsPage from '../../app/clients/page';
import ClientDetailPage from '../../app/clients/[clientId]/page';
import ProjectDetailPage from '../../app/clients/[clientId]/projects/[projectId]/page';
import SessionDetailPage from '../../app/clients/[clientId]/projects/[projectId]/sessions/[sessionId]/page';
import { CreateClientForm } from '../components/create-client-form';
import { CreateProjectForm } from '../components/create-project-form';
import { CreateSessionForm } from '../components/create-session-form';
import * as apiModule from '../lib/api';

const OWNER = {
  id: '11111111-2222-4333-8444-555555555555',
  loginIdentifier: 'owner@synthetic.invalid',
  timezone: 'Europe/Bratislava',
};

const CLIENT_ID = '22222222-3333-4444-8555-666666666666';
const PROJECT_ID = '33333333-4444-4555-8666-777777777777';
const SESSION_ID = '44444444-5555-4666-8777-888888888888';

describe('P1-04 Next.js engagement pages and accessible forms', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('redirects anonymous requests to /login across clients, client detail, project detail, and session detail pages without fetching domain data', async () => {
    vi.spyOn(apiModule, 'requireAuthenticatedOwner').mockImplementation(async () => {
      throw new Error('NEXT_REDIRECT:/login');
    });
    const clientsFetchSpy = vi.spyOn(apiModule, 'fetchClientsForOwner');
    const projectFetchSpy = vi.spyOn(apiModule, 'fetchClientProjectDetailForOwner');
    const sessionFetchSpy = vi.spyOn(apiModule, 'fetchProjectSessionDetailForOwner');

    await expect(ClientsPage()).rejects.toThrow('NEXT_REDIRECT:/login');
    await expect(
      ClientDetailPage({ params: Promise.resolve({ clientId: CLIENT_ID }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/login');
    await expect(
      ProjectDetailPage({
        params: Promise.resolve({ clientId: CLIENT_ID, projectId: PROJECT_ID }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/login');
    await expect(
      SessionDetailPage({
        params: Promise.resolve({
          clientId: CLIENT_ID,
          projectId: PROJECT_ID,
          sessionId: SESSION_ID,
        }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/login');

    expect(clientsFetchSpy).not.toHaveBeenCalled();
    expect(projectFetchSpy).not.toHaveBeenCalled();
    expect(sessionFetchSpy).not.toHaveBeenCalled();
  });

  it('renders project and session detail pages with owner timezone formatting and triggers notFound on mismatched/missing parents', async () => {
    vi.spyOn(apiModule, 'requireAuthenticatedOwner').mockResolvedValue(OWNER);
    vi.spyOn(apiModule, 'getRawSessionCookie').mockResolvedValue('a'.repeat(43));

    vi.spyOn(apiModule, 'fetchClientDetailForOwner').mockResolvedValue({
      kind: 'ok',
      data: {
        id: CLIENT_ID,
        name: 'Example Client',
        notes: 'Client engagement notes',
        createdAt: '2026-10-06T08:00:00.000Z',
        updatedAt: '2026-10-06T08:00:00.000Z',
      },
    });
    vi.spyOn(apiModule, 'fetchClientProjectDetailForOwner').mockResolvedValue({
      kind: 'ok',
      data: {
        id: PROJECT_ID,
        clientId: CLIENT_ID,
        name: 'Checkout QA',
        status: 'Active',
        description: 'Checkout regression scope',
        testingContext: 'Staging environment',
        instructions: 'Synthetic test data only',
        createdAt: '2026-10-06T08:30:00.000Z',
        updatedAt: '2026-10-06T08:30:00.000Z',
      },
    });
    vi.spyOn(apiModule, 'fetchProjectSessionsForOwner').mockResolvedValue({
      kind: 'ok',
      data: [
        {
          id: SESSION_ID,
          projectId: PROJECT_ID,
          purpose: 'Checkout regression',
          startedAt: '2026-10-06T09:00:00.000Z',
          endedAt: '2026-10-06T10:30:00.000Z',
          environment: 'staging',
          device: 'Desktop',
          os: 'Linux',
          browser: 'Firefox 132',
          buildVersion: '2026.10.06',
          notes: 'Checked order totals',
          createdAt: '2026-10-06T09:00:00.000Z',
          updatedAt: '2026-10-06T09:00:00.000Z',
        },
      ],
    });

    const projectUi = await ProjectDetailPage({
      params: Promise.resolve({ clientId: CLIENT_ID, projectId: PROJECT_ID }),
    });
    render(projectUi);

    expect(screen.getByRole('heading', { level: 1, name: 'Checkout QA' })).toBeTruthy();
    expect(screen.getByText('Status: Active')).toBeTruthy();
    const sessionLink = screen.getByRole('link', { name: 'Checkout regression' });
    expect(sessionLink.getAttribute('href')).toBe(
      `/clients/${CLIENT_ID}/projects/${PROJECT_ID}/sessions/${SESSION_ID}`,
    );
    // 09:00Z -> 11:00 CEST in Europe/Bratislava
    expect(screen.getByText('2026-10-06 11:00 (Europe/Bratislava)')).toBeTruthy();

    cleanup();

    vi.spyOn(apiModule, 'fetchProjectSessionDetailForOwner').mockResolvedValue({
      kind: 'ok',
      data: {
        id: SESSION_ID,
        projectId: PROJECT_ID,
        purpose: 'Checkout regression',
        startedAt: '2026-10-06T09:00:00.000Z',
        endedAt: '2026-10-06T10:30:00.000Z',
        environment: 'staging',
        device: 'Desktop',
        os: 'Linux',
        browser: 'Firefox 132',
        buildVersion: '2026.10.06',
        notes: 'Checked order totals',
        createdAt: '2026-10-06T09:00:00.000Z',
        updatedAt: '2026-10-06T09:00:00.000Z',
      },
    });

    const sessionUi = await SessionDetailPage({
      params: Promise.resolve({
        clientId: CLIENT_ID,
        projectId: PROJECT_ID,
        sessionId: SESSION_ID,
      }),
    });
    render(sessionUi);

    expect(screen.getByRole('heading', { level: 1, name: 'Checkout regression' })).toBeTruthy();
    expect(screen.getByText('2026-10-06 11:00 (Europe/Bratislava)')).toBeTruthy();
    expect(screen.getByText('2026-10-06 12:30 (Europe/Bratislava)')).toBeTruthy();
    expect(screen.getByText('Firefox 132')).toBeTruthy();
    expect(screen.getByText('Checked order totals')).toBeTruthy();

    // Mismatched parent returns kind: 'not_found' -> triggers Next.js real notFound() (NEXT_HTTP_ERROR_FALLBACK;404)
    vi.spyOn(apiModule, 'fetchClientProjectDetailForOwner').mockResolvedValue({
      kind: 'not_found',
    });

    await expect(
      ProjectDetailPage({
        params: Promise.resolve({ clientId: CLIENT_ID, projectId: PROJECT_ID }),
      }),
    ).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
  });

  it('rejects session end time before start time without network save, focuses error summary linked to #session-ended-at, and preserves all entered values', async () => {
    const postSpy = vi.fn();
    const fetchMock = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === '/api/v1/auth/csrf') {
        return new Response(JSON.stringify({ csrfToken: 'c'.repeat(43) }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (init?.method === 'POST') {
        postSpy(url, init.body);
      }
      return new Response(null, { status: 500 });
    });

    render(
      <CreateSessionForm
        clientId={CLIENT_ID}
        fetchImpl={fetchMock}
        onNavigate={vi.fn()}
        ownerTimezone="Europe/Bratislava"
        projectId={PROJECT_ID}
      />,
    );

    const purposeInput = screen.getByLabelText(/^Purpose$/i) as HTMLInputElement;
    const startInput = screen.getByLabelText(/Start time \(Europe\/Bratislava\)/i) as HTMLInputElement;
    const endInput = screen.getByLabelText(
      /End time \(Europe\/Bratislava, optional\)/i,
    ) as HTMLInputElement;
    const envInput = screen.getByLabelText(/Environment \(optional\)/i) as HTMLInputElement;
    const browserInput = screen.getByLabelText(/Browser \(optional\)/i) as HTMLInputElement;
    const notesInput = screen.getByLabelText(/Notes \(optional\)/i) as HTMLTextAreaElement;

    fireEvent.change(purposeInput, { target: { value: 'Checkout regression' } });
    fireEvent.change(startInput, { target: { value: '2026-10-06T11:00' } });
    fireEvent.change(endInput, { target: { value: '2026-10-06T10:30' } });
    fireEvent.change(envInput, { target: { value: 'staging' } });
    fireEvent.change(browserInput, { target: { value: 'Firefox 132' } });
    fireEvent.change(notesInput, { target: { value: 'Keep all entered fields' } });

    fireEvent.click(screen.getByRole('button', { name: /^Create session$/i }));

    const errorSummary = await screen.findByRole('alert');
    await waitFor(() => {
      expect(document.activeElement).toBe(errorSummary);
    });

    const endIssueLink = screen.getByRole('link', { name: /End time must not precede start time/i });
    expect(endIssueLink.getAttribute('href')).toBe('#session-ended-at');
    expect(endInput.getAttribute('aria-invalid')).toBe('true');
    expect(purposeInput.getAttribute('aria-invalid')).toBeNull();

    // No POST sent and all non-sensitive values preserved
    expect(postSpy).not.toHaveBeenCalled();
    expect(purposeInput.value).toBe('Checkout regression');
    expect(startInput.value).toBe('2026-10-06T11:00');
    expect(endInput.value).toBe('2026-10-06T10:30');
    expect(envInput.value).toBe('staging');
    expect(browserInput.value).toBe('Firefox 132');
    expect(notesInput.value).toBe('Keep all entered fields');
  });

  it('submits valid client, project, and session mutations with X-CSRF-Token and maps server 400 fieldErrors cleanly', async () => {
    const seenPosts: Array<{ url: string; csrf: string | null; body: unknown }> = [];
    let failSessionOnServerOnce = true;

    const fetchMock = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const hdrs = new Headers(init?.headers);

      if (url === '/api/v1/auth/csrf') {
        return new Response(JSON.stringify({ csrfToken: 'csrf_token_p104_valid_123456789012345' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (init?.method === 'POST') {
        const parsedBody = JSON.parse(String(init.body));
        seenPosts.push({ url, csrf: hdrs.get('x-csrf-token'), body: parsedBody });

        if (url === '/api/v1/clients') {
          return new Response(
            JSON.stringify({
              id: CLIENT_ID,
              name: 'Example Client',
              notes: null,
              createdAt: '2026-10-06T09:00:00.000Z',
              updatedAt: '2026-10-06T09:00:00.000Z',
            }),
            { status: 201, headers: { 'content-type': 'application/json' } },
          );
        }

        if (url === `/api/v1/clients/${CLIENT_ID}/projects`) {
          return new Response(
            JSON.stringify({
              id: PROJECT_ID,
              clientId: CLIENT_ID,
              name: 'Checkout QA',
              status: 'Active',
              description: null,
              testingContext: null,
              instructions: null,
              createdAt: '2026-10-06T09:00:00.000Z',
              updatedAt: '2026-10-06T09:00:00.000Z',
            }),
            { status: 201, headers: { 'content-type': 'application/json' } },
          );
        }

        if (url === `/api/v1/projects/${PROJECT_ID}/sessions`) {
          if (failSessionOnServerOnce) {
            failSessionOnServerOnce = false;
            return new Response(
              JSON.stringify({
                code: 'BAD_REQUEST',
                message: 'Request validation failed.',
                fieldErrors: [{ field: 'endedAt', issues: ['End precedes start'] }],
              }),
              { status: 400, headers: { 'content-type': 'application/json' } },
            );
          }

          return new Response(
            JSON.stringify({
              id: SESSION_ID,
              projectId: PROJECT_ID,
              purpose: 'Checkout regression',
              startedAt: '2026-10-06T09:00:00.000Z',
              endedAt: null,
              environment: null,
              device: null,
              os: null,
              browser: null,
              buildVersion: null,
              notes: null,
              createdAt: '2026-10-06T09:00:00.000Z',
              updatedAt: '2026-10-06T09:00:00.000Z',
            }),
            { status: 201, headers: { 'content-type': 'application/json' } },
          );
        }
      }

      return new Response(null, { status: 404 });
    });

    const clientNav = vi.fn();
    render(<CreateClientForm fetchImpl={fetchMock} onNavigate={clientNav} />);
    fireEvent.change(screen.getByLabelText(/Client name/i), {
      target: { value: 'Example Client' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create client$/i }));
    await waitFor(() => {
      expect(clientNav).toHaveBeenCalledWith(`/clients/${CLIENT_ID}`);
    });

    cleanup();
    const projectNav = vi.fn();
    render(
      <CreateProjectForm clientId={CLIENT_ID} fetchImpl={fetchMock} onNavigate={projectNav} />,
    );
    fireEvent.change(screen.getByLabelText(/Project name/i), {
      target: { value: 'Checkout QA' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create project$/i }));
    await waitFor(() => {
      expect(projectNav).toHaveBeenCalledWith(`/clients/${CLIENT_ID}/projects/${PROJECT_ID}`);
    });

    cleanup();
    const sessionNav = vi.fn();
    render(
      <CreateSessionForm
        clientId={CLIENT_ID}
        fetchImpl={fetchMock}
        onNavigate={sessionNav}
        ownerTimezone="Europe/Bratislava"
        projectId={PROJECT_ID}
      />,
    );
    fireEvent.change(screen.getByLabelText(/^Purpose$/i), {
      target: { value: 'Checkout regression' },
    });
    fireEvent.change(screen.getByLabelText(/Start time \(Europe\/Bratislava\)/i), {
      target: { value: '2026-10-06T11:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Create session$/i }));

    // First attempt simulates server 400 fieldErrors on endedAt -> focuses alert and links #session-ended-at
    const alertEl = await screen.findByRole('alert');
    await waitFor(() => {
      expect(document.activeElement).toBe(alertEl);
    });
    expect(
      screen.getByRole('link', { name: /End time must not precede start time/i }).getAttribute('href'),
    ).toBe('#session-ended-at');

    // Second attempt succeeds -> converts 11:00 Europe/Bratislava to 09:00:00.000Z and navigates
    fireEvent.click(screen.getByRole('button', { name: /^Create session$/i }));
    await waitFor(() => {
      expect(sessionNav).toHaveBeenCalledWith(`/clients/${CLIENT_ID}/projects/${PROJECT_ID}`);
    });

    expect(seenPosts).toEqual([
      {
        url: '/api/v1/clients',
        csrf: 'csrf_token_p104_valid_123456789012345',
        body: { name: 'Example Client', notes: null },
      },
      {
        url: `/api/v1/clients/${CLIENT_ID}/projects`,
        csrf: 'csrf_token_p104_valid_123456789012345',
        body: {
          name: 'Checkout QA',
          description: null,
          testingContext: null,
          instructions: null,
        },
      },
      expect.objectContaining({
        url: `/api/v1/projects/${PROJECT_ID}/sessions`,
        csrf: 'csrf_token_p104_valid_123456789012345',
        body: expect.objectContaining({
          purpose: 'Checkout regression',
          startedAt: '2026-10-06T09:00:00.000Z',
        }),
      }),
      expect.objectContaining({
        url: `/api/v1/projects/${PROJECT_ID}/sessions`,
        csrf: 'csrf_token_p104_valid_123456789012345',
      }),
    ]);
  });
});
