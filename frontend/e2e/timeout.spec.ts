import { test, expect, Page } from '@playwright/test';

// Demonstrates the inactivity timeout. The production setting is 30 minutes
// (SESSION_IDLE_MS); to keep this watchable the API is started with a short
// idle window for this run:
//
//   SESSION_IDLE_MS=10000 npm run start:prod      # in backend/
//
// With no user activity the client idle-checker (which ticks every 30s) and
// the server's idle invalidation both fire, bouncing the user back to /login.

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'Password123!';
const SHOTS = '../docs/walkthrough';

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test('session auto-invalidates after a period of inactivity', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill(DEMO_EMAIL);
  await page.locator('#password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  // Let the catalog's lazy external images actually paint before capturing.
  await page.waitForLoadState('networkidle').catch(() => {});
  await expect
    .poll(
      () =>
        page
          .locator('article.card img')
          .evaluateAll((imgs) =>
            imgs.slice(0, 8).filter((i) => (i as HTMLImageElement).naturalWidth > 0).length,
          ),
      { timeout: 12_000 },
    )
    .toBeGreaterThanOrEqual(4);
  await shot(page, '10-active-session');

  // Sit idle. Do NOT touch the page — any input would reset the idle timer.
  // The app should redirect us to /login on its own.
  await expect(page).toHaveURL(/\/login$/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Sign in to Shopwave' })).toBeVisible();
  await shot(page, '11-timed-out');
});
