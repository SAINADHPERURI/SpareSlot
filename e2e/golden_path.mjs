#!/usr/bin/env node
// Golden path against a running SpareSlot (local or deployed), through the public HTTP API only:
// sign in, request, a manager approves, the borrower pays the demo deposit, check-in with photos, return,
// refund, close, and the borrower reads the full timeline.
//
//   BASE_URL=http://localhost:3000 node e2e/golden_path.mjs
//
// Sign-in uses the demo "sign in as" endpoint (DEMO_LOGIN_ENABLED=true). To use passwords instead, set
// E2E_PASSWORD to the demo password (never commit it). Needs Node 22 or later, no packages.
import { deflateSync, crc32 } from 'node:zlib';

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const BORROWER = process.env.E2E_BORROWER || 'asha.student@demo.spareslot.example';
const MANAGER = process.env.E2E_MANAGER || 'dev.manager@demo.spareslot.example';
const RESOURCE = process.env.E2E_RESOURCE || 'Cordless drill and driver set';

let step = 0;
function pass(msg) { console.log(`PASS ${String(++step).padStart(2)}  ${msg}`); }
function fail(msg) { console.error(`FAIL ${String(++step).padStart(2)}  ${msg}`); process.exit(1); }
function check(cond, msg) { if (!cond) fail(msg); }

async function api(method, path, token, body) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) fail(`${method} ${path} -> ${res.status} ${typeof json === 'object' ? JSON.stringify(json) : text.slice(0, 200)}`);
  return json;
}

async function signIn(email) {
  if (process.env.E2E_PASSWORD) {
    return (await api('POST', '/api/auth/login', null, { email, password: process.env.E2E_PASSWORD })).token;
  }
  return (await api('POST', '/api/auth/demo-login', null, { email })).token;
}

/** A small solid-colour PNG, built here byte by byte (nothing copied). */
function png(width, height, [r, g, b]) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function upload(bookingId, token, phase, caption, colour) {
  const form = new FormData();
  form.append('file', new Blob([png(64, 48, colour)], { type: 'image/png' }), 'photo.png');
  form.append('phase', phase);
  form.append('caption', caption);
  return api('POST', `/api/bookings/${bookingId}/photos`, token, form);
}

/** A free one-hour window 10 to 40 days ahead that avoids every booked window. */
function freeWindow(booked) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 10 + Math.floor(Math.random() * 30));
    start.setUTCHours(3 + Math.floor(Math.random() * 10), 0, 0, 0);
    const end = new Date(start.getTime() + 3600_000);
    const clash = booked.some(w => new Date(w.startAt) < end && new Date(w.endAt) > start);
    if (!clash) return [start.toISOString(), end.toISOString()];
  }
  fail('could not find a free window');
}

console.log(`SpareSlot golden path against ${BASE}\n`);

const health = await fetch(BASE + '/api/resources?size=1');
check(health.ok, `the API answers at ${BASE}/api (status ${health.status})`);
pass('the API is up');

const borrower = await signIn(BORROWER);
const manager = await signIn(MANAGER);
pass(`signed in as the borrower (${BORROWER}) and the manager (${MANAGER})`);

const search = await api('GET', `/api/resources?q=${encodeURIComponent(RESOURCE)}`, borrower);
const resource = search.items.find(r => r.name === RESOURCE);
check(resource, `found "${RESOURCE}" by searching`);
check(resource.depositMinor > 0, 'the resource needs a refundable deposit');
check(resource.eligible === true, 'the borrower is eligible');
pass(`discovered "${resource.name}" (${resource.orgName}), deposit ₹${resource.depositMinor / 100}`);

const detail = await api('GET', `/api/resources/${resource.id}`, borrower);
const [startAt, endAt] = freeWindow(detail.bookedWindows);
const created = await api('POST', '/api/bookings', borrower, { resourceId: resource.id, startAt, endAt, purpose: 'Golden path check: putting up a shelf' });
const id = created.booking.id;
check(created.booking.status === 'requested', `the new request is "requested" (was ${created.booking.status})`);
pass(`requested ${startAt} to ${endAt} (booking ${id})`);

const queueView = await api('GET', `/api/bookings/${id}`, manager);
check(queueView.booking.allowedActions.includes('approve'), 'the manager is offered "approve"');
const approved = await api('POST', `/api/bookings/${id}/decision`, manager, { action: 'approve', reason: 'Meets the conditions of use' });
check(approved.booking.status === 'approved' && approved.booking.depositStatus === 'pending', 'approved, deposit pending');
pass('the manager approved it with a reason; the deposit is pending');

const blocked = await fetch(`${BASE}/api/bookings/${id}/check-in`, {
  method: 'POST', headers: { Authorization: `Bearer ${manager}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ rating: 'good', notes: '' }) });
const blockedBody = await blocked.json();
check(blocked.status === 422 && blockedBody.rule === 'deposit_before_pickup', 'check-in is refused before the deposit is paid (422)');
pass(`pickup blocked in plain words: "${blockedBody.message.slice(0, 60)}..."`);

const paid = await api('POST', `/api/bookings/${id}/deposit/pay`, borrower);
check(paid.status === 'paid' && paid.demoNotice === 'Demo payment: no real money moves', 'paid through the demo provider');
pass(`the borrower paid the demo deposit (${paid.ledger.at(-1).providerRef})`);

await upload(id, borrower, 'check_in', 'Small scratch on the case at pickup', [51, 65, 85]);
await upload(id, manager, 'check_in', 'Handover: all parts present', [30, 58, 138]);
const checkedIn = await api('POST', `/api/bookings/${id}/check-in`, manager, { rating: 'good', notes: 'Batteries charged, all bits present' });
check(checkedIn.booking.status === 'checked_in', 'checked in');
pass('checked in with a condition record and photos from both sides');

const photos = await api('GET', `/api/bookings/${id}/photos`, borrower);
check(photos.length === 2 && new Set(photos.map(p => p.side)).size === 2, 'both photos are listed, one per side');
const img = await fetch(`${BASE}/api/photos/${photos[0].id}/content`, { headers: { Authorization: `Bearer ${borrower}` } });
check(img.ok && img.headers.get('x-content-type-options') === 'nosniff', 'the borrower can open the photo; served with nosniff');
const anon = await fetch(`${BASE}/api/photos/${photos[0].id}/content`);
check(anon.status === 401, 'an anonymous visitor cannot open a condition photo');
pass('condition photos are private to the borrower and staff');

await upload(id, manager, 'return', 'Returned as it left', [15, 118, 110]);
const returned = await api('POST', `/api/bookings/${id}/return`, manager, { rating: 'good', notes: 'All present' });
check(returned.booking.status === 'returned', 'returned');
pass('returned with a return condition record');

const deposit = await api('GET', `/api/bookings/${id}/deposit`, manager);
check(deposit.originalCondition === true && deposit.recommendedAction === 'refund', 'original condition; advice is to refund');
const refunded = await api('POST', `/api/bookings/${id}/deposit/refund`, manager, { reason: 'Returned in its original condition' });
check(refunded.status === 'refunded', 'refunded');
pass('a person refunded the deposit with a reason');

const closed = await api('POST', `/api/bookings/${id}/close`, manager);
check(closed.booking.status === 'closed', 'closed');
pass('the booking is closed');

const events = await api('GET', `/api/bookings/${id}/events`, borrower);
const actions = events.map(e => e.action);
for (const expected of ['booking.requested', 'booking.approved', 'deposit.charged', 'photo.added', 'booking.checked_in',
  'booking.returned', 'deposit.refunded', 'booking.closed']) {
  check(actions.includes(expected), `the timeline contains ${expected}`);
}
const approval = events.find(e => e.action === 'booking.approved');
check(approval.actorRole === 'manager' && approval.reason === 'Meets the conditions of use', 'the approval names who and why');
pass(`the borrower reads the full timeline (${events.length} events, who, what, when and why)`);

console.log('\nGolden path passed.');
