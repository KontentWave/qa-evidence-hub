import { test as base, expect, request as playwrightRequest } from '@playwright/test';

const ownerLogin = process.env.E2E_OWNER_LOGIN ?? 'owner@synthetic.invalid';
const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'SyntheticOwnerPass!2026#Valid';

interface SeededProjectFixture {
  readonly clientId: string;
  readonly projectId: string;
  readonly projectName: string;
}

const test = base.extend<{
  seedProjectWithNewerSessions: (count: number) => Promise<SeededProjectFixture>;
}>({
  seedProjectWithNewerSessions: async ({ baseURL }, use) => {
    const origin = baseURL ?? 'http://127.0.0.1:8080';
    await use(async (count: number) => {
      const api = await playwrightRequest.newContext({ baseURL: origin });
      try {
        const csrfBootstrap = await api.get('/api/v1/auth/csrf');
        expect(csrfBootstrap.status()).toBe(200);
        const { csrfToken: preLoginCsrf } = (await csrfBootstrap.json()) as { csrfToken: string };

        const loginRes = await api.post('/api/v1/auth/login', {
          headers: {
            origin,
            'x-csrf-token': preLoginCsrf,
          },
          data: {
            loginIdentifier: ownerLogin,
            password: ownerPassword,
          },
        });
        expect(loginRes.status()).toBe(200);
        const { csrfToken } = (await loginRes.json()) as { csrfToken: string };

        const clientRes = await api.post('/api/v1/clients', {
          headers: {
            origin,
            'x-csrf-token': csrfToken,
          },
          data: {
            name: 'Paginated Client',
            notes: 'Synthetic fixture client for >200 session pagination',
          },
        });
        expect(clientRes.status()).toBe(201);
        const { id: clientId } = (await clientRes.json()) as { id: string };

        const projectName = 'Paginated Checkout QA';
        const projectRes = await api.post(`/api/v1/clients/${clientId}/projects`, {
          headers: {
            origin,
            'x-csrf-token': csrfToken,
          },
          data: {
            name: projectName,
            description: 'Synthetic project seeded with 200 newer sessions',
          },
        });
        expect(projectRes.status()).toBe(201);
        const { id: projectId } = (await projectRes.json()) as { id: string };

        const baseStartedMs = Date.parse('2026-10-15T09:00:00.000Z');
        const batchSize = 8;
        for (let offset = 0; offset < count; offset += batchSize) {
          const batchIndices = Array.from(
            { length: Math.min(batchSize, count - offset) },
            (_, idx) => offset + idx,
          );
          await Promise.all(
            batchIndices.map(async (index) => {
              // Pair adjacent sessions on identical minute start times to exercise tie ordering too.
              const startedIso = new Date(
                baseStartedMs + Math.floor(index / 2) * 60_000,
              ).toISOString();
              const sessionRes = await api.post(`/api/v1/projects/${projectId}/sessions`, {
                headers: {
                  origin,
                  'x-csrf-token': csrfToken,
                },
                data: {
                  purpose: `Newer regression run #${String(index + 1).padStart(3, '0')}`,
                  startedAt: startedIso,
                  environment: 'staging',
                },
              });
              expect(sessionRes.status()).toBe(201);
            }),
          );
        }

        await api.post('/api/v1/auth/logout', {
          headers: {
            origin,
            'x-csrf-token': csrfToken,
          },
        });

        return { clientId, projectId, projectName };
      } finally {
        await api.dispose();
      }
    });
  },
});

test.describe('@P1-04 @S1 @AC01 @AC07 @browser Nginx engagement context workflow', () => {
  test('creates client, active project, and test session, focuses error summary while preserving inputs on invalid time range, reopens saved details after reload, and redirects anonymous project page to /login', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const ssrSetCookieViolations: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('response', (res) => {
      const parsed = new URL(res.url());
      if (
        res.request().method() === 'GET' &&
        (parsed.pathname === '/clients' || parsed.pathname.startsWith('/clients/')) &&
        res.status() === 200
      ) {
        const setCookie = res.headers()['set-cookie'];
        if (setCookie) {
          ssrSetCookieViolations.push(`${parsed.pathname}: ${setCookie}`);
        }
      }
    });

    // 1. Sign in as provisioned owner through Nginx.
    await page.goto('/login');
    await page.getByLabel('Login identifier', { exact: true }).fill(ownerLogin);
    await page.getByLabel('Password', { exact: true }).fill(ownerPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => u.pathname === '/');

    // 2. Navigate to Clients and create a synthetic client.
    await page.getByRole('link', { name: 'Clients', exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/clients');
    await expect(page.getByRole('heading', { level: 1, name: 'Clients' })).toBeVisible();

    await page.getByLabel('Client name', { exact: true }).fill('Example Client');
    await page.getByLabel('Notes (optional)', { exact: true }).fill('Synthetic client notes');
    await page.getByRole('button', { name: 'Create client' }).click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/i);

    await expect(page.getByRole('heading', { level: 1, name: 'Example Client' })).toBeVisible();
    await expect(page.getByText('Synthetic client notes')).toBeVisible();

    // 3. Create an active project for that client.
    await page.getByLabel('Project name', { exact: true }).fill('Checkout QA');
    await page
      .getByLabel('Description (optional)', { exact: true })
      .fill('Checkout payment and confirmation regression');
    await page
      .getByLabel('Testing context (optional)', { exact: true })
      .fill('Staging payment sandbox');
    await page
      .getByLabel('Instructions (optional)', { exact: true })
      .fill('Use synthetic test cards only.');
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.waitForURL(/\/clients\/[0-9a-f-]{36}\/projects\/[0-9a-f-]{36}$/i);

    const projectPageUrl = page.url();
    const projectPagePath = new URL(projectPageUrl).pathname;

    await expect(page.getByRole('heading', { level: 1, name: 'Checkout QA' })).toBeVisible();
    await expect(page.getByText('Status: Active')).toBeVisible();
    await expect(page.getByText('Staging payment sandbox')).toBeVisible();

    // 4. Submit an invalid session time range (end before start) -> verify error focus, link to end-time field, no saved session, and preserved inputs.
    const purposeInput = page.getByLabel('Purpose', { exact: true });
    const startInput = page.getByLabel('Start time (Europe/Bratislava)', { exact: true });
    const endInput = page.getByLabel('End time (Europe/Bratislava, optional)', { exact: true });
    const envInput = page.getByLabel('Environment (optional)', { exact: true });
    const deviceInput = page.getByLabel('Device (optional)', { exact: true });
    const osInput = page.getByLabel('Operating system (optional)', { exact: true });
    const browserInput = page.getByLabel('Browser (optional)', { exact: true });
    const buildInput = page.getByLabel('Build or version (optional)', { exact: true });
    const notesInput = page.getByLabel('Notes (optional)', { exact: true });

    await purposeInput.fill('Checkout regression');
    await startInput.fill('2026-10-06T11:00');
    await endInput.fill('2026-10-06T10:15');
    await envInput.fill('staging');
    await deviceInput.fill('Desktop');
    await osInput.fill('Linux');
    await browserInput.fill('Firefox 132');
    await buildInput.fill('2026.10.06-rc1');
    await notesInput.fill('Guest and signed-in checkout run');

    await page.getByRole('button', { name: 'Create session' }).click();

    const errorSummary = page.locator('#session-error-summary');
    await expect(errorSummary).toBeVisible();
    await expect(errorSummary).toBeFocused();
    const endErrorLink = errorSummary.getByRole('link', {
      name: 'End time must not precede start time.',
    });
    await expect(endErrorLink).toHaveAttribute('href', '#session-ended-at');
    await expect(endInput).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('No test sessions created for this project yet.')).toBeVisible();

    await expect(purposeInput).toHaveValue('Checkout regression');
    await expect(startInput).toHaveValue('2026-10-06T11:00');
    await expect(endInput).toHaveValue('2026-10-06T10:15');
    await expect(envInput).toHaveValue('staging');
    await expect(deviceInput).toHaveValue('Desktop');
    await expect(osInput).toHaveValue('Linux');
    await expect(browserInput).toHaveValue('Firefox 132');
    await expect(buildInput).toHaveValue('2026.10.06-rc1');
    await expect(notesInput).toHaveValue('Guest and signed-in checkout run');

    // 5. Fix end time, create session, verify listed under project, reopen session, and reload to prove saved persistence.
    await endInput.fill('2026-10-06T12:30');
    await page.getByRole('button', { name: 'Create session' }).click();
    await page.waitForURL((u) => u.pathname === projectPagePath);

    const listedSessionLink = page.getByRole('link', { name: 'Checkout regression' });
    await expect(listedSessionLink).toBeVisible();
    await expect(page.getByText('2026-10-06 11:00 (Europe/Bratislava)')).toBeVisible();
    await expect(page.getByText('2026-10-06 12:30 (Europe/Bratislava)')).toBeVisible();

    await listedSessionLink.click();
    await page.waitForURL(
      /\/clients\/[0-9a-f-]{36}\/projects\/[0-9a-f-]{36}\/sessions\/[0-9a-f-]{36}$/i,
    );

    const reloadRes = await page.reload();
    expect(reloadRes).not.toBeNull();
    expect(reloadRes!.status()).toBe(200);
    expect(reloadRes!.headers()['cache-control']).toBe('private, no-store, no-transform');
    expect(reloadRes!.headers()['x-content-type-options']).toBe('nosniff');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Checkout regression' }),
    ).toBeVisible();
    await expect(page.getByText('2026-10-06 11:00 (Europe/Bratislava)')).toBeVisible();
    await expect(page.getByText('2026-10-06 12:30 (Europe/Bratislava)')).toBeVisible();
    await expect(page.getByText('staging', { exact: true })).toBeVisible();
    await expect(page.getByText('Desktop', { exact: true })).toBeVisible();
    await expect(page.getByText('Linux', { exact: true })).toBeVisible();
    await expect(page.getByText('Firefox 132', { exact: true })).toBeVisible();
    await expect(page.getByText('2026.10.06-rc1', { exact: true })).toBeVisible();
    await expect(page.getByText('Guest and signed-in checkout run')).toBeVisible();

    // 6. Sign out and verify anonymous project-page requests redirect to /login without protected content.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/\/login$/);

    const rawAnonProjectRes = await page.request.get(projectPagePath, { maxRedirects: 0 });
    expect([302, 303, 307]).toContain(rawAnonProjectRes.status());
    expect(rawAnonProjectRes.headers()['location'] ?? '').toMatch(/\/login$/);
    expect(rawAnonProjectRes.headers()['cache-control']).toBe('private, no-store, no-transform');
    expect(rawAnonProjectRes.headers()['x-content-type-options']).toBe('nosniff');
    expect(rawAnonProjectRes.headers()['set-cookie']).toBeUndefined();
    const rawAnonBody = await rawAnonProjectRes.text();
    expect(rawAnonBody).not.toContain('Checkout QA');
    expect(rawAnonBody).not.toContain('Staging payment sandbox');

    await page.goto(projectPagePath);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sign in to QA Evidence Hub' }),
    ).toBeVisible();
    await expect(page.getByText('Checkout QA')).toHaveCount(0);

    expect(ssrSetCookieViolations).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('reaches a backdated 201st session created through the form via keyboard-accessible "Older sessions" link after seeding 200 newer sessions', async ({
    page,
    seedProjectWithNewerSessions,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const ssrSetCookieViolations: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('response', (res) => {
      const parsed = new URL(res.url());
      if (
        res.request().method() === 'GET' &&
        (parsed.pathname === '/clients' || parsed.pathname.startsWith('/clients/')) &&
        res.status() === 200
      ) {
        const setCookie = res.headers()['set-cookie'];
        if (setCookie) {
          ssrSetCookieViolations.push(`${parsed.pathname}${parsed.search}: ${setCookie}`);
        }
      }
    });

    // 1. Seed 200 newer sessions through Nginx using the Playwright fixture.
    const seeded = await seedProjectWithNewerSessions(200);
    const projectPagePath = `/clients/${seeded.clientId}/projects/${seeded.projectId}`;

    // 2. Sign in and open the project page.
    await page.goto('/login');
    await page.getByLabel('Login identifier', { exact: true }).fill(ownerLogin);
    await page.getByLabel('Password', { exact: true }).fill(ownerPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => u.pathname === '/');

    await page.goto(projectPagePath);
    await expect(
      page.getByRole('heading', { level: 1, name: seeded.projectName }),
    ).toBeVisible();
    // With exactly 200 sessions, there is no 201st older session yet.
    await expect(page.getByRole('link', { name: 'Older sessions', exact: true })).toHaveCount(0);

    // 3. Create a backdated 201st session through the project form.
    const backdatedPurpose = 'Backdated kick-off baseline';
    await page.getByLabel('Purpose', { exact: true }).fill(backdatedPurpose);
    await page
      .getByLabel('Start time (Europe/Bratislava)', { exact: true })
      .fill('2026-09-15T14:30');
    await page.getByLabel('Environment (optional)', { exact: true }).fill('staging');

    const createPostPromise = page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' &&
        new URL(res.url()).pathname === `/api/v1/projects/${seeded.projectId}/sessions`,
    );

    await page.getByRole('button', { name: 'Create session' }).click();
    const createPostRes = await createPostPromise;
    expect(createPostRes.status()).toBe(201);
    // Wait until CreateSessionForm's window.location.assign reload finishes rendering the 201-session page.
    await expect(page.getByRole('link', { name: 'Older sessions', exact: true })).toBeVisible();
    await page.waitForLoadState('load');

    // 4. Visit the project afresh, verify the first 200 newest sessions omit the backdated 201st session, and follow "Older sessions" via keyboard.
    await page.goto('/clients');
    await expect(page.getByRole('heading', { level: 1, name: 'Clients' })).toBeVisible();
    const freshVisitRes = await page.goto(projectPagePath);
    expect(freshVisitRes).not.toBeNull();
    expect(freshVisitRes!.status()).toBe(200);
    expect(freshVisitRes!.headers()['cache-control']).toBe('private, no-store, no-transform');
    expect(freshVisitRes!.headers()['x-content-type-options']).toBe('nosniff');

    await expect(page.getByRole('link', { name: backdatedPurpose, exact: true })).toHaveCount(0);

    const olderSessionsLink = page.getByRole('link', { name: 'Older sessions', exact: true });
    await expect(olderSessionsLink).toBeVisible();
    await olderSessionsLink.focus();
    await expect(olderSessionsLink).toBeFocused();
    await page.keyboard.press('Enter');

    await page.waitForURL(
      (u) => u.pathname === projectPagePath && Boolean(u.searchParams.get('cursor')),
    );

    // 5. Open the backdated 201st session from the older-sessions page and reload.
    await expect(page.getByRole('link', { name: 'Older sessions', exact: true })).toHaveCount(0);
    const backdatedSessionLink = page.getByRole('link', { name: backdatedPurpose, exact: true });
    await expect(backdatedSessionLink).toBeVisible();
    await expect(page.getByText('2026-09-15 14:30 (Europe/Bratislava)')).toBeVisible();

    await backdatedSessionLink.click();
    await page.waitForURL(
      new RegExp(
        `^.*/clients/${seeded.clientId}/projects/${seeded.projectId}/sessions/[0-9a-f-]{36}$`,
        'i',
      ),
    );

    const reloadRes = await page.reload();
    expect(reloadRes).not.toBeNull();
    expect(reloadRes!.status()).toBe(200);
    expect(reloadRes!.headers()['cache-control']).toBe('private, no-store, no-transform');
    expect(reloadRes!.headers()['x-content-type-options']).toBe('nosniff');

    // 6. Assert saved purpose and start time after reload.
    await expect(page.getByRole('heading', { level: 1, name: backdatedPurpose })).toBeVisible();
    await expect(page.getByText('2026-09-15 14:30 (Europe/Bratislava)')).toBeVisible();
    await expect(page.locator('time[datetime="2026-09-15T12:30:00.000Z"]')).toHaveCount(1);
    await expect(page.getByText('staging', { exact: true })).toBeVisible();

    expect(ssrSetCookieViolations).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
