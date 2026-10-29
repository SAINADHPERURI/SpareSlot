-- V92: demo bookings that stay current for about two weeks (fictional data).
--
-- Judges may test the live demo days after it is deployed. The V90 "upcoming" bookings are a few days ahead and
-- age quickly, so this adds the same kinds of example 11 to 14 days ahead:
--   20  Asha's request for the laser cutter, waiting for Dev (Brickyard manager) to decide
--   21  Meera's approved camera kit booking with the ₹500 deposit still to pay
--   22  Ravi's approved LED light set booking; a judge can request the same time as Zoya to see the waitlist
--   23  Kabir's approved drill set booking with the deposit paid, ready for pickup
-- Each is written in the real order (request, approval with the deposit snapshot, ledger) with its audit events.

INSERT INTO bookings (id, resource_id, requester_id, team_id, start_at, end_at, purpose, created_at, updated_at) VALUES
 ('40000000-0000-4000-8000-000000000020', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', NULL,
  date_trunc('day', now()) + interval '12 days 4 hours 30 minutes', date_trunc('day', now()) + interval '12 days 6 hours 30 minutes',
  'Cutting acrylic side panels for the robotics club', now() - interval '2 hours', now() - interval '2 hours'),
 ('40000000-0000-4000-8000-000000000021', '30000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000003', NULL,
  date_trunc('day', now()) + interval '13 days 4 hours 30 minutes', date_trunc('day', now()) + interval '13 days 8 hours 30 minutes',
  'Street interviews for the brickyard documentary', now() - interval '5 hours', now() - interval '5 hours'),
 ('40000000-0000-4000-8000-000000000022', '30000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000002', NULL,
  date_trunc('day', now()) + interval '12 days 4 hours 30 minutes', date_trunc('day', now()) + interval '12 days 7 hours 30 minutes',
  'Lighting a lab demonstration video', now() - interval '7 hours', now() - interval '7 hours'),
 ('40000000-0000-4000-8000-000000000023', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000004',
  '60000000-0000-4000-8000-000000000001',
  date_trunc('day', now()) + interval '11 days 4 hours 30 minutes', date_trunc('day', now()) + interval '11 days 7 hours 30 minutes',
  'Mounting test rigs at the shared office', now() - interval '9 hours', now() - interval '9 hours');

-- approvals by people, with the deposit snapshot where the resource has one
UPDATE bookings SET status = 'approved', decision_reason = 'Portfolio verified; the kit is free that day',
       decided_by = '20000000-0000-4000-8000-000000000016', deposit_minor = 50000, deposit_status = 'pending'
WHERE id = '40000000-0000-4000-8000-000000000021';
UPDATE bookings SET status = 'approved', decision_reason = 'Lights are free that morning',
       decided_by = '20000000-0000-4000-8000-000000000016'
WHERE id = '40000000-0000-4000-8000-000000000022';
UPDATE bookings SET status = 'approved', decision_reason = 'Team registration verified; drill set is free',
       decided_by = '20000000-0000-4000-8000-000000000011', deposit_minor = 30000, deposit_status = 'pending'
WHERE id = '40000000-0000-4000-8000-000000000023';
UPDATE bookings SET decided_at = created_at + interval '1 hour'
WHERE id IN ('40000000-0000-4000-8000-000000000021', '40000000-0000-4000-8000-000000000022', '40000000-0000-4000-8000-000000000023');

-- Kabir pays the drill set deposit through the demo provider (the ledger trigger marks it paid)
INSERT INTO deposit_transactions (booking_id, kind, amount_minor, provider, provider_ref, actor_id, created_at)
VALUES ('40000000-0000-4000-8000-000000000023', 'charge', 30000, 'demo', 'DEMO-PAY-5EED0023',
        '20000000-0000-4000-8000-000000000004', now() - interval '7 hours');

INSERT INTO audit_events (at, actor_id, actor_role, action, entity_type, entity_id, from_status, to_status, reason, details) VALUES
 (now() - interval '2 hours', '20000000-0000-4000-8000-000000000001', 'user', 'booking.requested', 'booking',
  '40000000-0000-4000-8000-000000000020', NULL, 'requested', NULL, '{"purpose": "Cutting acrylic side panels for the robotics club"}'),
 (now() - interval '5 hours', '20000000-0000-4000-8000-000000000003', 'user', 'booking.requested', 'booking',
  '40000000-0000-4000-8000-000000000021', NULL, 'requested', NULL, '{"purpose": "Street interviews for the brickyard documentary"}'),
 (now() - interval '4 hours', '20000000-0000-4000-8000-000000000016', 'manager', 'booking.approved', 'booking',
  '40000000-0000-4000-8000-000000000021', 'requested', 'approved', 'Portfolio verified; the kit is free that day', '{"depositMinor": 50000}'),
 (now() - interval '7 hours', '20000000-0000-4000-8000-000000000002', 'user', 'booking.requested', 'booking',
  '40000000-0000-4000-8000-000000000022', NULL, 'requested', NULL, '{"purpose": "Lighting a lab demonstration video"}'),
 (now() - interval '6 hours', '20000000-0000-4000-8000-000000000016', 'manager', 'booking.approved', 'booking',
  '40000000-0000-4000-8000-000000000022', 'requested', 'approved', 'Lights are free that morning', '{}'),
 (now() - interval '9 hours', '20000000-0000-4000-8000-000000000004', 'user', 'booking.requested', 'booking',
  '40000000-0000-4000-8000-000000000023', NULL, 'requested', NULL, '{"purpose": "Mounting test rigs at the shared office"}'),
 (now() - interval '8 hours', '20000000-0000-4000-8000-000000000011', 'manager', 'booking.approved', 'booking',
  '40000000-0000-4000-8000-000000000023', 'requested', 'approved', 'Team registration verified; drill set is free', '{"depositMinor": 30000}'),
 (now() - interval '7 hours', '20000000-0000-4000-8000-000000000004', 'user', 'deposit.charged', 'booking',
  '40000000-0000-4000-8000-000000000023', 'pending', 'paid', NULL,
  '{"amountMinor": 30000, "currency": "INR", "provider": "demo", "providerRef": "DEMO-PAY-5EED0023"}');

INSERT INTO notifications (user_id, message, entity_type, entity_id, created_at) VALUES
 ('20000000-0000-4000-8000-000000000011', 'New request for Laser cutter (60 W) from Asha Verma', 'booking',
  '40000000-0000-4000-8000-000000000020', now() - interval '2 hours'),
 ('20000000-0000-4000-8000-000000000003', 'Approved: Mirrorless camera kit. Portfolio verified; the kit is free that day. Pay the ₹500 deposit before pickup.',
  'booking', '40000000-0000-4000-8000-000000000021', now() - interval '4 hours');
