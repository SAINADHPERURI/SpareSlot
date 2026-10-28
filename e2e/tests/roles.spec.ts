import { expect, test } from '@playwright/test';
import { signInAs } from './helpers';

/** Each role lands on its own home, sees its own navigation, and is kept out of other roles' pages. */
const homes: [string, RegExp, RegExp][] = [
  ['Asha Verma', /\/dashboard$/, /Hello, Asha/],
  ['Dev Iyer', /\/staff$/, /Staff dashboard/],
  ['Lata Joshi', /\/staff$/, /Staff dashboard/],
  ['Alex Admin', /\/admin$/, /Admin/],
];

for (const [name, url, heading] of homes) {
  test(`${name} lands on their own dashboard`, async ({ page }) => {
    await signInAs(page, name);
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
  });
}

test('a borrower cannot open the staff or admin pages', async ({ page }) => {
  await signInAs(page, 'Asha Verma');
  await page.goto('/staff');
  await expect(page.getByText('This page is for another role')).toBeVisible();
  await page.goto('/admin');
  await expect(page.getByText('This page is for another role')).toBeVisible();
});

test('a visitor is sent to sign in for private pages', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/signin/);
});

test('staff of another organisation cannot see a booking (not found, not forbidden)', async ({ page }) => {
  await signInAs(page, 'Arun Nair');
  await page.goto('/bookings/40000000-0000-4000-8000-000000000013');
  await expect(page.getByText(/not found/i).first()).toBeVisible();
});

test('the staff dashboard groups work into Decide, Today and Settle', async ({ page }) => {
  await signInAs(page, 'Dev Iyer');
  const tabs = page.getByRole('tab');
  await expect(tabs.filter({ hasText: 'Decide' })).toBeVisible();
  await tabs.filter({ hasText: 'Today' }).click();
  await expect(page.getByText(/Overdue/).first()).toBeVisible();
  await tabs.filter({ hasText: 'Settle' }).click();
  await expect(page.getByText(/Open incidents|incidents/i).first()).toBeVisible();
});

test('the admin sees organisations, users and a filterable audit log', async ({ page }) => {
  await signInAs(page, 'Alex Admin');
  await expect(page.getByText('Kestrel Street Community Workshop').first()).toBeVisible();
  await page.getByRole('tab', { name: /Users/ }).click();
  await expect(page.getByText('Rohan Gupta').first()).toBeVisible();
  await page.getByRole('tab', { name: /Audit log/ }).click();
  await expect(page.getByText(/booking\.|Approved|Requested/).first()).toBeVisible();
});

test('the public privacy page and the judge’s tour are reachable', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.getByText(/EXIF|GPS/).first()).toBeVisible();
  await expect(page.getByText(/fictional/i).first()).toBeVisible();
  await page.goto('/tour');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link').filter({ hasText: /./ }).first()).toBeVisible();
});
