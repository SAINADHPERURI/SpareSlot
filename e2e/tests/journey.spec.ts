import { expect, test } from '@playwright/test';
import { futureSlot, openTab, png, signInAs, signInWithPassword, submitDialog } from './helpers';

/**
 * The ten-step journey, clicked through the real UI by a brand-new borrower:
 * discover, get blocked by eligibility, get verified, request, get approved, pay the demo deposit,
 * check in with photos from both sides, return, get the deposit back, read the full history.
 */
test.describe.serial('the ten-step journey through the UI', () => {
  const stamp = Date.now();
  const email = `e2e.borrower.${stamp}@test.example`;
  const password = 'e2e-password-1234';
  const fullName = `E2E Borrower ${stamp}`;
  let bookingUrl = '';

  test('1. a visitor discovers resources and sees the rules before asking', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Discover');
    await page.getByLabel('Search').fill('laser');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('link', { name: /Laser cutter/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Conditions of use' })).toBeVisible();
    await expect(page.getByText('Safety induction').first()).toBeVisible();
  });

  test('2. a new borrower registers and is blocked by a missing credential', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Full name').fill(fullName);
    await page.getByRole('textbox', { name: /^Email/ }).fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByLabel('I am a').selectOption('student');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).not.toHaveURL(/\/register/);

    await page.goto('/?q=laser');
    await page.getByLabel('Search').fill('laser');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('link', { name: /Laser cutter/ }).first().click();
    await expect(page.getByText('You are not eligible yet')).toBeVisible();
    await expect(page.getByText(/You are missing it/)).toBeVisible();

    // follow the link to the verification form, prefilled with the missing credential
    await page.getByRole('link', { name: /Request .*verification/i }).first().click();
    await expect(page.getByLabel('Credential')).toHaveValue('safety_induction');
    await page.getByLabel('Evidence').fill('Attended the Saturday induction (E2E test)');
    await page.getByLabel('Who should review it').selectOption({ label: 'Brickyard Makerspace' });
    await page.getByRole('button', { name: 'Send for review' }).click();
    await expect(page.getByText(/sent for review/i)).toBeVisible();
  });

  test('3. a manager verifies the credential with a reason', async ({ page }) => {
    await signInAs(page, 'Dev Iyer');
    await page.goto('/staff/verifications');
    const card = page.locator('li, article, section').filter({ hasText: fullName }).filter({ has: page.getByRole('button', { name: 'Verify' }) }).last();
    await card.getByRole('button', { name: 'Verify', exact: true }).click();
    await submitDialog(page, 'Verify', 'Induction record checked (E2E)');
    await expect(page.getByText(fullName)).toHaveCount(0);
  });

  test('4. the borrower is now eligible, and a too-long request is refused with the rule', async ({ page }) => {
    await signInWithPassword(page, email, password);
    await page.goto('/');
    await page.getByLabel('Search').fill('laser');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('link', { name: /Laser cutter/ }).first().click();
    await expect(page.getByText('You are not eligible yet')).toHaveCount(0);
    await expect(page.getByText(/You have it/)).toBeVisible();

    // the drill set: no credential needed, a ₹300 deposit, at most 4 hours
    await page.goto('/');
    await page.getByLabel('Search').fill('drill');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('link', { name: /Cordless drill/ }).first().click();
    const tooLong = futureSlot(6);
    await page.getByLabel('Start').fill(tooLong.start);
    await page.getByLabel('End').fill(tooLong.end);
    await page.getByLabel('What will you use it for?').fill('E2E: too long on purpose');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /at most 4 hours/ })).toBeVisible();
  });

  test('5. the borrower requests the drill set', async ({ page }) => {
    await signInWithPassword(page, email, password);
    await page.goto('/');
    await page.getByLabel('Search').fill('drill');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByRole('link', { name: /Cordless drill/ }).first().click();
    const slot = futureSlot(1);
    await page.getByLabel('Start').fill(slot.start);
    await page.getByLabel('End').fill(slot.end);
    await page.getByLabel('What will you use it for?').fill('E2E: putting up a shelf');
    await page.getByRole('button', { name: 'Send request' }).click();
    await page.waitForURL(/\/bookings\/[0-9a-f-]{36}/);
    bookingUrl = new URL(page.url()).pathname;
    await expect(page.getByText('Requested').first()).toBeVisible();
    // a borrower is never offered staff actions
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  });

  test('6. the manager approves with a reason; the reason is mandatory', async ({ page }) => {
    await signInAs(page, 'Dev Iyer');
    await page.goto(bookingUrl);
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    const submit = page.getByRole('dialog').getByRole('button', { name: 'Approve', exact: true });
    await expect(submit).toBeDisabled();
    await submitDialog(page, 'Approve', 'Meets the conditions of use (E2E)');
    await expect(page.getByText('Approved').first()).toBeVisible();
    // pickup is blocked until the deposit is paid, in plain words
    await expect(page.getByText(/Pay the deposit before pickup/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Check in (pickup)' })).toHaveCount(0);
  });

  test('7. the borrower pays the demo deposit and adds a pickup photo', async ({ page }) => {
    await signInWithPassword(page, email, password);
    await page.goto(bookingUrl);
    await openTab(page, /Deposit/);
    await expect(page.getByText('Demo payment: no real money moves').first()).toBeVisible();
    await page.getByRole('button', { name: 'Pay deposit' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Demo payment: no real money moves')).toBeVisible();
    await dialog.getByRole('button', { name: /Pay ₹300 \(demo\)/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(/DEMO-PAY-/)).toBeVisible();

    await openTab(page, /Photos/);
    await page.getByLabel('Step', { exact: true }).selectOption('check_in');
    await page.getByLabel(/^Photo \(/).setInputFiles({ name: 'pickup.png', mimeType: 'image/png', buffer: png(64, 40, [51, 65, 85]) });
    await page.getByLabel('Caption').fill('Small scratch already on the case');
    await page.getByRole('button', { name: 'Upload photo' }).click();
    await expect(page.getByText('Small scratch already on the case')).toBeVisible();
  });

  test('8. the manager checks it in with a condition record and a photo', async ({ page }) => {
    await signInAs(page, 'Dev Iyer');
    await page.goto(bookingUrl);
    await page.getByRole('button', { name: 'Check in (pickup)' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /^Good/ }).check();
    await dialog.getByLabel('Notes').fill('All bits present (E2E)');
    await dialog.getByRole('button', { name: 'Record and check in' }).click();
    // the dialog offers a photo upload straight after
    await dialog.getByLabel(/^Photo \(/).setInputFiles({ name: 'handover.png', mimeType: 'image/png', buffer: png() });
    await dialog.getByRole('button', { name: 'Upload photo' }).click();
    await expect(dialog.getByText(/1 photo added/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Checked in').first()).toBeVisible();

    await openTab(page, /Photos/);
    await expect(page.getByText('Small scratch already on the case')).toBeVisible();
    await expect(page.getByRole('img', { name: /scratch/i })).toBeVisible();
  });

  test('9. the manager records the return, refunds the deposit and closes the booking', async ({ page }) => {
    await signInAs(page, 'Dev Iyer');
    await page.goto(bookingUrl);
    await page.getByRole('button', { name: 'Record return' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radio', { name: /^Good/ }).check();
    await dialog.getByRole('button', { name: 'Record return' }).click();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Returned').first()).toBeVisible();

    await openTab(page, /Deposit/);
    await page.getByRole('button', { name: 'Refund deposit' }).click();
    // beside the decision: both condition records, the advice, and photos from both sides
    const evidence = page.getByRole('dialog');
    await expect(evidence.getByText(/Advice only/i)).toBeVisible();
    await expect(evidence.getByText('At check-in')).toBeVisible();
    await expect(evidence.getByText('At return')).toBeVisible();
    await expect(evidence.getByText('Small scratch already on the case')).toBeVisible();
    await submitDialog(page, 'Refund deposit', 'Returned in its original condition (E2E)');
    await expect(page.getByText(/Refunded/).first()).toBeVisible();

    await page.getByRole('button', { name: 'Close booking' }).click();
    await submitDialog(page, 'Close booking');
    await expect(page.getByText('Closed').first()).toBeVisible();
  });

  test('10. the borrower reads the full history: who, what, when and why', async ({ page }) => {
    await signInWithPassword(page, email, password);
    await page.goto(bookingUrl);
    await openTab(page, 'History');
    const history = page.getByRole('tabpanel');
    for (const step of ['Requested', 'Approved', 'Deposit paid', 'Photo added', 'Checked in', 'Returned', 'Deposit refunded', 'Closed']) {
      await expect(history.getByText(step, { exact: false }).first(), `history shows "${step}"`).toBeVisible();
    }
    await expect(history.getByText('Meets the conditions of use (E2E)')).toBeVisible();
    await expect(history.getByText(/Dev Iyer \(Manager\)/).first()).toBeVisible();

    // and the bell has notifications that link back to this booking
    await page.getByRole('button', { name: /Notifications, \d+ unread/ }).click();
    await expect(page.getByRole('link', { name: /Cordless drill/ }).first()).toBeVisible();
  });
});
