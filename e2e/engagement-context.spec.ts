import { expect, test } from '@playwright/test';

const ownerLogin = process.env.E2E_OWNER_LOGIN ?? 'owner@synthetic.invalid';
const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'SyntheticOwnerPass!2026#Valid';

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
});
