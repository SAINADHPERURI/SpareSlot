import { expect, type Page } from '@playwright/test';
import { deflateSync, crc32 } from 'node:zlib';

export const DEMO = '@demo.spareslot.example';

/** Signs in through the "Sign in as a demo account" panel on the sign-in page. */
export async function signInAs(page: Page, fullName: string) {
  await page.goto('/signin');
  await page.getByRole('button', { name: new RegExp(`^${fullName}`) }).click();
  await expect(page).not.toHaveURL(/\/signin/);
}

/** Signs in with an email and password through the sign-in form. */
export async function signInWithPassword(page: Page, email: string, password: string) {
  await page.goto('/signin');
  await page.getByRole('textbox', { name: /^Email/ }).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).not.toHaveURL(/\/signin/);
}

export async function signOut(page: Page) {
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/');
}

/** A value for an <input type="datetime-local">: a random free-looking slot 15 to 45 days ahead. */
export function futureSlot(hours: number): { start: string; end: string } {
  const d = new Date();
  d.setDate(d.getDate() + 15 + Math.floor(Math.random() * 30));
  d.setHours(9 + Math.floor(Math.random() * 6), Math.random() < 0.5 ? 0 : 30, 0, 0);
  const e = new Date(d.getTime() + hours * 3600_000);
  const fmt = (x: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
  };
  return { start: fmt(d), end: fmt(e) };
}

/** A small solid-colour PNG built in code (nothing copied). */
export function png(width = 48, height = 32, [r, g, b] = [43, 122, 120]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Opens a tab of the booking page by its visible name. */
export async function openTab(page: Page, name: RegExp | string) {
  await page.getByRole('tablist', { name: 'Booking sections' }).getByRole('tab', { name }).click();
}

/** Fills the reason in the open dialog and presses its submit button. */
export async function submitDialog(page: Page, button: string, reason?: string, reasonLabel = 'Reason') {
  const dialog = page.getByRole('dialog');
  if (reason !== undefined) await dialog.getByLabel(reasonLabel).fill(reason);
  await dialog.getByRole('button', { name: button, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/** The page must not scroll sideways. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(1);
}
