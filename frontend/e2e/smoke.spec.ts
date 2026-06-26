import { test, expect, Page } from '@playwright/test';

// End-to-end regression of the main user journey: login (incl. brute-force
// lockout), catalog, infinite scroll, page-size control, category filter,
// session persistence across reload, and logout.
//
// Assumes the API (:4000) and web app (:3000) are running and the database is
// seeded with the demo user + products (see README → Running locally).

const DEMO_EMAIL = 'demo@example.com';
const DEMO_PASSWORD = 'Password123!';

// Extra dwell between steps so the recorded video is followable. Off in CI.
const PACE = process.env.E2E_SLOMO ? 900 : 0;
const SHOTS = '../docs/walkthrough';

async function dwell(page: Page) {
  if (PACE) await page.waitForTimeout(PACE);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

// Product images are lazy-loaded from an external host (via a redirect), so
// they can lag well behind networkidle. Wait until the top rows have actually
// painted before screenshotting, so the catalog looks complete in the video.
async function settle(page: Page) {
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
  if (PACE) await page.waitForTimeout(600);
}

async function productCount(page: Page) {
  return page.locator('article.card').count();
}

test('catalog regression: login, scroll, page size, persistence, logout', async ({
  page,
}) => {
  // 1) Login screen renders.
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in to Shopwave' })).toBeVisible();
  await shot(page, '01-login-screen');
  await dwell(page);

  // 2) Brute-force protection. Hammer a throwaway account with bad passwords
  //    so the demo account itself never gets locked. After enough failures
  //    the API returns the "too many attempts" lockout message.
  await page.locator('#email').fill('attacker@example.com');

  const errorBanner = page.locator('.error-banner');
  let lockoutSeen = false;
  for (let i = 1; i <= 7; i++) {
    await page.locator('#password').fill(`wrong-pass-${i}`);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(errorBanner).toBeVisible();
    const message = (await errorBanner.textContent())?.toLowerCase() ?? '';
    if (i === 1) {
      await shot(page, '02-invalid-credentials');
      await dwell(page);
    }
    if (message.includes('too many attempts')) {
      lockoutSeen = true;
      await shot(page, '03-bruteforce-lockout');
      await dwell(page);
      break;
    }
  }
  expect(lockoutSeen, 'expected the account to lock after repeated failures').toBeTruthy();

  // 3) Successful login with the seeded demo account (a different identity,
  //    so it isn't affected by the lockout above).
  await page.locator('#email').fill(DEMO_EMAIL);
  await page.locator('#password').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // 4) Catalog renders behind the auth guard.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.locator('article.card').first()).toBeVisible();
  await settle(page);
  await shot(page, '04-catalog');
  await dwell(page);

  // 5) Infinite scroll loads further pages as we reach the bottom.
  const beforeScroll = await productCount(page);
  await page.evaluate(async () => {
    for (let i = 0; i < 8; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 250));
    }
  });
  await expect.poll(() => productCount(page), { timeout: 15_000 }).toBeGreaterThan(beforeScroll);
  await settle(page);
  await shot(page, '05-infinite-scroll');
  await dwell(page);

  // 6) Page size is user-configurable and drives the request limit (5..50).
  const wantsLimit = (limit: string) => (req: { url(): string }) => {
    if (!req.url().includes('/api/products')) return false;
    return new URL(req.url()).searchParams.get('limit') === limit;
  };

  const fifty = page.waitForRequest(wantsLimit('50'));
  await page.getByLabel('Items per page').selectOption('50');
  await fifty;
  await expect.poll(() => productCount(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(50);
  await settle(page);
  await shot(page, '06-page-size-50');
  await dwell(page);

  const five = page.waitForRequest(wantsLimit('5'));
  await page.getByLabel('Items per page').selectOption('5');
  await five;
  await dwell(page);

  // 7) Category filter narrows the catalog.
  const audio = page.waitForRequest(
    (req) =>
      req.url().includes('/api/products') &&
      new URL(req.url()).searchParams.get('category') === 'Audio',
  );
  await page.getByLabel('Category').selectOption('Audio');
  await audio;
  await expect(page.locator('article.card').first()).toBeVisible();
  await settle(page);
  await shot(page, '07-category-filter');
  await dwell(page);

  // 8) Session persists across a full page reload (cookie-backed session).
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await settle(page);
  await shot(page, '08-session-persists');
  await dwell(page);

  // 9) Logout returns to the login screen.
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in to Shopwave' })).toBeVisible();
  await shot(page, '09-logged-out');
  await dwell(page);
});
