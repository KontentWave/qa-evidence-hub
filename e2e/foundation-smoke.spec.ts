import { expect, test } from '@playwright/test';

test.describe('@foundation @smoke Nginx reverse-proxy browser smoke', () => {
  test('renders Ready status on / through Nginx with clean static assets and security headers', async ({
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

    const response = await page.goto('/');
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);

    const headers = response!.headers();
    expect(headers['cache-control']).toBe('private, no-store, no-transform');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['server'] ?? '').not.toMatch(/nginx\//i);

    await expect(page.locator('main#main-content')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'QA Evidence Hub' })).toBeVisible();

    const statusBanner = page.getByRole('status');
    await expect(statusBanner).toBeVisible();
    await expect(statusBanner).toContainText('System status: Ready');

    expect(staticAssetResponses.length).toBeGreaterThan(0);
    for (const asset of staticAssetResponses) {
      expect(asset.status, `Expected 200 for static asset ${asset.url}`).toBe(200);
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
