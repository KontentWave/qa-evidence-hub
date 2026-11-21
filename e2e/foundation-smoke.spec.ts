import { expect, test } from '@playwright/test';

const ownerLogin = process.env.E2E_OWNER_LOGIN ?? 'owner@synthetic.invalid';
const ownerPassword = process.env.E2E_OWNER_PASSWORD ?? 'SyntheticOwnerPass!2026#Valid';

test.describe('@foundation @S1 @AC07 @smoke Nginx reverse-proxy auth and readiness smoke', () => {
  test('redirects anonymous /, focuses error summary on failed keyboard login, shows Ready for signed-in owner, and restores denial on logout', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const staticAssetResponses: Array<{ url: string; status: number }> = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('response', (res) => {
      if (res.url().includes('/_next/static/')) {
        staticAssetResponses.push({ url: res.url(), status: res.status() });
      }
    });

    // 1. Anonymous request to / redirects to /login without rendering Ready or workspace content.
    const response = await page.goto('/');
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);

    const headers = response!.headers();
    expect(headers['cache-control']).toBe('private, no-store, no-transform');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['server'] ?? '').not.toMatch(/nginx\//i);

    await expect(page.locator('main#main-content')).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sign in to QA Evidence Hub' }),
    ).toBeVisible();
    await expect(page.getByText('System status: Ready')).toHaveCount(0);

    expect(staticAssetResponses.length).toBeGreaterThan(0);
    for (const asset of staticAssetResponses) {
      expect(asset.status, `Expected 200 for static asset ${asset.url}`).toBe(200);
    }

    // 2. Keyboard navigation + visible error focus on invalid password while preserving login identifier.
    const identifierInput = page.getByLabel('Login identifier', { exact: true });
    const passwordInput = page.getByLabel('Password', { exact: true });

    await identifierInput.focus();
    await page.keyboard.type(ownerLogin);
    await page.keyboard.press('Tab');
    await expect(passwordInput).toBeFocused();
    await page.keyboard.type('WrongSyntheticPassword!2026');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
    await page.keyboard.press('Enter');

    const errorSummary = page.getByRole('alert', { name: /Sign-in failed/i });
    await expect(errorSummary).toBeVisible();
    await expect(errorSummary).toContainText('Invalid login identifier or password');
    await expect(errorSummary).toBeFocused();
    await expect(identifierInput).toHaveValue(ownerLogin);
    await expect(passwordInput).toHaveValue('');

    // Clear expected 401 network console entry emitted by Chromium on the negative login test.
    consoleErrors.length = 0;

    // 3. Sign in as provisioned owner and verify protected / renders Ready without SSR Set-Cookie.
    let homeDocSetCookie: string | undefined;
    page.on('response', (res) => {
      const parsed = new URL(res.url());
      if (parsed.pathname === '/' && res.status() === 200) {
        homeDocSetCookie = res.headers()['set-cookie'];
      }
    });

    await passwordInput.fill(ownerPassword);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => u.pathname === '/');

    await expect(page.getByRole('heading', { level: 1, name: 'QA Evidence Hub' })).toBeVisible();
    await expect(page.getByText(ownerLogin)).toBeVisible();

    const statusBanner = page.getByRole('status');
    await expect(statusBanner).toBeVisible();
    await expect(statusBanner).toContainText('System status: Ready');
    expect(homeDocSetCookie).toBeUndefined();

    // 4. Sign out and confirm anonymous access to / is denied again.
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/\/login$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sign in to QA Evidence Hub' }),
    ).toBeVisible();

    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('System status: Ready')).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
