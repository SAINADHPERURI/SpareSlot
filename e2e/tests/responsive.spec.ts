import { expect, test } from '@playwright/test';
import { expectNoHorizontalScroll, signInAs } from './helpers';

/** Runs in the "phone" project (Pixel 5 viewport): no sideways scrolling, and the menu works. */

test('discover fits a phone screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test('the menu opens and navigates at phone width', async ({ page }) => {
  await signInAs(page, 'Meera Das');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: 'My bookings', exact: true }).click();
  await expect(page).toHaveURL(/\/bookings$/);
  await expectNoHorizontalScroll(page);
});

for (const [who, path] of [
  ['Tara Bose', '/bookings/40000000-0000-4000-8000-000000000013'],
  ['Dev Iyer', '/staff'],
  ['Meera Das', '/dashboard'],
  ['Alex Admin', '/admin'],
] as const) {
  test(`${path} fits a phone screen for ${who}`, async ({ page }) => {
    await signInAs(page, who);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalScroll(page);
  });
}
